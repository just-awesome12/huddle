import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Counted majority polls (Phase 16) — framework-free; hooks in
 * ./polls-hooks. A question + options; one vote per member (changeable);
 * the group sees counts + the leading option. RLS scopes everything to
 * group members; group_id is denormalized on options/votes (D74).
 */

export type PollRow = Database['public']['Tables']['polls']['Row'];
export type PollOptionRow = Database['public']['Tables']['poll_options']['Row'];

export interface PollOptionWithCount {
  id: string;
  label: string;
  position: number;
  count: number;
}

export interface PollWithResults {
  id: string;
  groupId: string;
  question: string;
  createdBy: string | null;
  closedAt: string | null;
  createdAt: string;
  options: PollOptionWithCount[];
  totalVotes: number;
  /** The current user's chosen option for this poll, if any. */
  myOptionId: string | null;
}

export interface CreatePollParams {
  groupId: string;
  question: string;
  options: string[];
}

export const pollQueryKeys = {
  list: (groupId: string) => ['groups', groupId, 'polls'] as const,
};

/**
 * All polls for a group with per-option counts and the caller's own vote,
 * newest first. Three RLS-scoped reads aggregated in JS (mirrors
 * fetchGroupVoteState) — no nested embed needed.
 */
export async function fetchGroupPolls(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<PollWithResults[]> {
  const [pollsRes, optionsRes, votesRes] = await Promise.all([
    client
      .from('polls')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    client
      .from('poll_options')
      .select('id, poll_id, label, position')
      .eq('group_id', groupId)
      .order('position', { ascending: true }),
    client.from('poll_votes').select('poll_id, option_id, user_id').eq('group_id', groupId),
  ]);
  if (pollsRes.error) throwMapped(pollsRes.error);
  if (optionsRes.error) throwMapped(optionsRes.error);
  if (votesRes.error) throwMapped(votesRes.error);

  const countByOption = new Map<string, number>();
  const totalByPoll = new Map<string, number>();
  const myVoteByPoll = new Map<string, string>();
  for (const v of votesRes.data ?? []) {
    countByOption.set(v.option_id, (countByOption.get(v.option_id) ?? 0) + 1);
    totalByPoll.set(v.poll_id, (totalByPoll.get(v.poll_id) ?? 0) + 1);
    if (v.user_id === userId) myVoteByPoll.set(v.poll_id, v.option_id);
  }

  const optionsByPoll = new Map<string, PollOptionWithCount[]>();
  for (const o of optionsRes.data ?? []) {
    const list = optionsByPoll.get(o.poll_id) ?? [];
    list.push({
      id: o.id,
      label: o.label,
      position: o.position,
      count: countByOption.get(o.id) ?? 0,
    });
    optionsByPoll.set(o.poll_id, list);
  }

  return (pollsRes.data ?? []).map((p) => ({
    id: p.id,
    groupId: p.group_id,
    question: p.question,
    createdBy: p.created_by,
    closedAt: p.closed_at,
    createdAt: p.created_at,
    options: optionsByPoll.get(p.id) ?? [],
    totalVotes: totalByPoll.get(p.id) ?? 0,
    myOptionId: myVoteByPoll.get(p.id) ?? null,
  }));
}

/** Create a poll with its options (creator only, via RLS). */
export async function createPoll(client: HuddleClient, params: CreatePollParams): Promise<string> {
  const userId = await requireUserId(client);
  const { data: poll, error } = await client
    .from('polls')
    .insert({ group_id: params.groupId, created_by: userId, question: params.question })
    .select('id')
    .single();
  if (error) throwMapped(error);

  const rows = params.options.map((label, position) => ({
    poll_id: poll!.id,
    group_id: params.groupId,
    label,
    position,
  }));
  const { error: optErr } = await client.from('poll_options').insert(rows);
  if (optErr) {
    // Roll back the orphan poll so a failed options insert doesn't leave
    // a question with no options (best-effort, mirrors D55).
    await client.from('polls').delete().eq('id', poll!.id);
    throwMapped(optErr);
  }
  return poll!.id;
}

/** Cast or change the caller's vote (one per poll — upsert on the PK). */
export async function castVote(
  client: HuddleClient,
  params: { pollId: string; groupId: string; optionId: string },
): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('poll_votes').upsert(
    {
      poll_id: params.pollId,
      group_id: params.groupId,
      option_id: params.optionId,
      user_id: userId,
    },
    { onConflict: 'poll_id,user_id' },
  );
  if (error) throwMapped(error);
}

/** Withdraw the caller's vote. */
export async function clearVote(client: HuddleClient, pollId: string): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client
    .from('poll_votes')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', userId);
  if (error) throwMapped(error);
}

/** Close or reopen a poll (creator or admin, via RLS). */
export async function setPollClosed(
  client: HuddleClient,
  pollId: string,
  closed: boolean,
): Promise<void> {
  const { error } = await client
    .from('polls')
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq('id', pollId);
  if (error) throwMapped(error);
}

/** Delete a poll (creator or admin, via RLS; options + votes cascade). */
export async function deletePoll(client: HuddleClient, pollId: string): Promise<void> {
  const { error } = await client.from('polls').delete().eq('id', pollId);
  if (error) throwMapped(error);
}

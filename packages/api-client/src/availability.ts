import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Availability "when's free?" polls (Phase 16b) — framework-free; hooks in
 * ./availability-hooks. A member marks yes/maybe/no per proposed date; the
 * group reads the overlap. RLS scopes everything to group members;
 * group_id/poll_id are denormalized on dates/responses (D74).
 */

export type AvailabilityStatus = 'yes' | 'maybe' | 'no';

export interface AvailabilityDateResult {
  id: string;
  date: string;
  position: number;
  yes: number;
  maybe: number;
  no: number;
  /** The current user's status for this date, if they've answered. */
  myStatus: AvailabilityStatus | null;
}

export interface AvailabilityPollWithResults {
  id: string;
  groupId: string;
  title: string;
  createdBy: string | null;
  closedAt: string | null;
  createdAt: string;
  dates: AvailabilityDateResult[];
  /** Members who have answered at least one date. */
  respondentCount: number;
}

export interface CreateAvailabilityPollParams {
  groupId: string;
  title: string;
  dates: string[];
}

export const availabilityQueryKeys = {
  list: (groupId: string) => ['groups', groupId, 'availability'] as const,
};

/**
 * All availability polls for a group with per-date yes/maybe/no tallies and
 * the caller's own answers, newest first. Three RLS-scoped reads aggregated
 * in JS (mirrors fetchGroupPolls).
 */
export async function fetchGroupAvailabilityPolls(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<AvailabilityPollWithResults[]> {
  const [pollsRes, datesRes, respRes] = await Promise.all([
    client
      .from('availability_polls')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    client
      .from('availability_dates')
      .select('id, poll_id, event_date, position')
      .eq('group_id', groupId)
      .order('event_date', { ascending: true }),
    client
      .from('availability_responses')
      .select('date_id, poll_id, user_id, status')
      .eq('group_id', groupId),
  ]);
  if (pollsRes.error) throwMapped(pollsRes.error);
  if (datesRes.error) throwMapped(datesRes.error);
  if (respRes.error) throwMapped(respRes.error);

  const tally = new Map<string, { yes: number; maybe: number; no: number }>();
  const myStatusByDate = new Map<string, AvailabilityStatus>();
  const respondentsByPoll = new Map<string, Set<string>>();
  for (const r of respRes.data ?? []) {
    const t = tally.get(r.date_id) ?? { yes: 0, maybe: 0, no: 0 };
    t[r.status as AvailabilityStatus] += 1;
    tally.set(r.date_id, t);
    if (r.user_id === userId) myStatusByDate.set(r.date_id, r.status as AvailabilityStatus);
    const set = respondentsByPoll.get(r.poll_id) ?? new Set<string>();
    set.add(r.user_id);
    respondentsByPoll.set(r.poll_id, set);
  }

  const datesByPoll = new Map<string, AvailabilityDateResult[]>();
  for (const d of datesRes.data ?? []) {
    const t = tally.get(d.id) ?? { yes: 0, maybe: 0, no: 0 };
    const list = datesByPoll.get(d.poll_id) ?? [];
    list.push({
      id: d.id,
      date: d.event_date,
      position: d.position,
      yes: t.yes,
      maybe: t.maybe,
      no: t.no,
      myStatus: myStatusByDate.get(d.id) ?? null,
    });
    datesByPoll.set(d.poll_id, list);
  }

  return (pollsRes.data ?? []).map((p) => ({
    id: p.id,
    groupId: p.group_id,
    title: p.title,
    createdBy: p.created_by,
    closedAt: p.closed_at,
    createdAt: p.created_at,
    dates: datesByPoll.get(p.id) ?? [],
    respondentCount: respondentsByPoll.get(p.id)?.size ?? 0,
  }));
}

/** Create an availability poll with its candidate dates (creator only, RLS). */
export async function createAvailabilityPoll(
  client: HuddleClient,
  params: CreateAvailabilityPollParams,
): Promise<string> {
  const userId = await requireUserId(client);
  const { data: poll, error } = await client
    .from('availability_polls')
    .insert({ group_id: params.groupId, created_by: userId, title: params.title })
    .select('id')
    .single();
  if (error) throwMapped(error);

  const sorted = [...params.dates].sort();
  const rows = sorted.map((event_date, position) => ({
    poll_id: poll!.id,
    group_id: params.groupId,
    event_date,
    position,
  }));
  const { error: dErr } = await client.from('availability_dates').insert(rows);
  if (dErr) {
    await client.from('availability_polls').delete().eq('id', poll!.id);
    throwMapped(dErr);
  }
  return poll!.id;
}

/** Set/change the caller's status for a date (upsert on the (date,user) PK). */
export async function setAvailability(
  client: HuddleClient,
  params: { pollId: string; dateId: string; groupId: string; status: AvailabilityStatus },
): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('availability_responses').upsert(
    {
      date_id: params.dateId,
      poll_id: params.pollId,
      group_id: params.groupId,
      user_id: userId,
      status: params.status,
    },
    { onConflict: 'date_id,user_id' },
  );
  if (error) throwMapped(error);
}

/** Close or reopen a poll (creator or admin, via RLS). */
export async function setAvailabilityClosed(
  client: HuddleClient,
  pollId: string,
  closed: boolean,
): Promise<void> {
  const { error } = await client
    .from('availability_polls')
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq('id', pollId);
  if (error) throwMapped(error);
}

/** Delete a poll (creator or admin, via RLS; dates + responses cascade). */
export async function deleteAvailabilityPoll(client: HuddleClient, pollId: string): Promise<void> {
  const { error } = await client.from('availability_polls').delete().eq('id', pollId);
  if (error) throwMapped(error);
}

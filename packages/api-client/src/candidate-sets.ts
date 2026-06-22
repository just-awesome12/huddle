import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Saved candidate sets (Phase 15e) — framework-free; hooks in
 * ./candidate-sets-hooks. A named, reusable picker shortlist (the
 * schedulerless half of "recurring"). `idea_ids` is intersected with the
 * live on-radar pool at pick time, so a saved set survives idea churn.
 * RLS: any member reads/saves; author-or-admin edits/deletes.
 */

export type CandidateSetRow = Database['public']['Tables']['candidate_sets']['Row'];

export interface CreateCandidateSetParams {
  groupId: string;
  name: string;
  ideaIds: string[];
}

export const candidateSetQueryKeys = {
  list: (groupId: string) => ['groups', groupId, 'candidate-sets'] as const,
};

/** A group's saved sets, newest first (RLS: members only). */
export async function fetchGroupCandidateSets(
  client: HuddleClient,
  groupId: string,
): Promise<CandidateSetRow[]> {
  const { data, error } = await client
    .from('candidate_sets')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throwMapped(error);
  return data ?? [];
}

/** Save a new set as the current user. */
export async function createCandidateSet(
  client: HuddleClient,
  params: CreateCandidateSetParams,
): Promise<CandidateSetRow> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('candidate_sets')
    .insert({
      group_id: params.groupId,
      created_by: userId,
      name: params.name,
      idea_ids: params.ideaIds,
    })
    .select()
    .single();
  if (error) throwMapped(error);
  return data!;
}

/** Delete a set (RLS: author or a group admin). */
export async function deleteCandidateSet(client: HuddleClient, setId: string): Promise<void> {
  const { error } = await client.from('candidate_sets').delete().eq('id', setId);
  if (error) throwMapped(error);
}

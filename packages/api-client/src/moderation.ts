import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Moderation data layer (Phase 10, OQ-5) — framework-free; hooks in
 * ./moderation-hooks. Reporting an idea and blocking/unblocking users.
 * Blocking's hide-effect is enforced in the ideas SELECT RLS (migration
 * 019), so this layer only manages the block list itself.
 */

type ReportReason = Database['public']['Enums']['report_reason'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type BlockedProfile = Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export interface ReportIdeaParams {
  ideaId: string;
  reason: ReportReason;
  details?: string;
}

export const moderationQueryKeys = {
  reportedIdeas: (userId: string) => ['moderation', 'reported', userId] as const,
  blocked: (userId: string) => ['moderation', 'blocked', userId] as const,
};

// -----------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------

/**
 * Report an idea. Idempotent at the DB level (unique reporter+idea) — a
 * repeat report surfaces as a conflict, which callers treat as "already
 * reported" rather than an error.
 */
export async function reportIdea(client: HuddleClient, params: ReportIdeaParams): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('reports').insert({
    idea_id: params.ideaId,
    reporter_id: userId,
    reason: params.reason,
    details: params.details ?? null,
  });
  if (error) throwMapped(error);
}

/** Idea ids the current user has already reported (for "Reported" UI). */
export async function fetchMyReportedIdeaIds(client: HuddleClient): Promise<string[]> {
  const { data, error } = await client.from('reports').select('idea_id');
  if (error) throwMapped(error);
  return (data ?? []).map((r) => r.idea_id as string);
}

// -----------------------------------------------------------------------
// Blocking
// -----------------------------------------------------------------------

export async function blockUser(client: HuddleClient, blockedId: string): Promise<void> {
  const blockerId = await requireUserId(client);
  const { error } = await client
    .from('blocked_users')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id' },
    );
  if (error) throwMapped(error);
}

export async function unblockUser(client: HuddleClient, blockedId: string): Promise<void> {
  const blockerId = await requireUserId(client);
  const { error } = await client
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throwMapped(error);
}

/** The current user's blocked users, with their public profiles. */
export async function fetchBlockedProfiles(client: HuddleClient): Promise<BlockedProfile[]> {
  const { data, error } = await client
    .from('blocked_users')
    .select(
      'blocked:profiles!blocked_users_blocked_id_fkey(id, username, display_name, avatar_url)',
    )
    .order('created_at', { ascending: false });
  if (error) throwMapped(error);
  return (data ?? [])
    .map((row) => (row as unknown as { blocked: BlockedProfile | null }).blocked)
    .filter((p): p is BlockedProfile => p != null);
}

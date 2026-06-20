import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { throwMapped, requireUserId } from './internal';

/**
 * RSVPs ("I'm in") on ideas — framework-free. One row per (idea, user),
 * upserted. Hook wrappers live in ./rsvps-hooks.
 */

type HuddleClient = SupabaseClient<Database>;
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type RsvpStatus = Database['public']['Enums']['rsvp_status'];

export interface IdeaRsvp {
  userId: string;
  status: RsvpStatus;
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface GroupRsvpState {
  /** Count of 'going' RSVPs per idea. */
  goingByIdea: Record<string, number>;
  /** The caller's own RSVP status per idea. */
  mineByIdea: Record<string, RsvpStatus>;
}

export const rsvpQueryKeys = {
  idea: (ideaId: string) => ['ideas', ideaId, 'rsvps'] as const,
  groupState: (groupId: string) => ['groups', groupId, 'rsvp-state'] as const,
};

/** Set (or change) the caller's RSVP on an idea. */
export async function setRsvp(
  client: HuddleClient,
  ideaId: string,
  groupId: string,
  status: RsvpStatus,
): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('idea_rsvps').upsert(
    {
      idea_id: ideaId,
      user_id: userId,
      group_id: groupId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'idea_id,user_id' },
  );
  if (error) throwMapped(error);
}

/** Withdraw the caller's RSVP from an idea. */
export async function removeRsvp(client: HuddleClient, ideaId: string): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client
    .from('idea_rsvps')
    .delete()
    .eq('idea_id', ideaId)
    .eq('user_id', userId);
  if (error) throwMapped(error);
}

/** All RSVPs on one idea, with member profiles (for the going stack). */
export async function fetchIdeaRsvps(client: HuddleClient, ideaId: string): Promise<IdeaRsvp[]> {
  const { data, error } = await client
    .from('idea_rsvps')
    .select('user_id, status, profiles(id, username, display_name, avatar_url)')
    .eq('idea_id', ideaId);

  if (error) throwMapped(error);

  return (data ?? []).map((r) => ({
    userId: r.user_id,
    status: r.status,
    profile: r.profiles as Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>,
  }));
}

/** Going-counts + the caller's own status, per idea, across a group. */
export async function fetchGroupRsvpState(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<GroupRsvpState> {
  const { data, error } = await client
    .from('idea_rsvps')
    .select('idea_id, user_id, status')
    .eq('group_id', groupId);

  if (error) throwMapped(error);

  const goingByIdea: Record<string, number> = {};
  const mineByIdea: Record<string, RsvpStatus> = {};
  for (const r of data ?? []) {
    if (r.status === 'going') goingByIdea[r.idea_id] = (goingByIdea[r.idea_id] ?? 0) + 1;
    if (r.user_id === userId) mineByIdea[r.idea_id] = r.status;
  }
  return { goingByIdea, mineByIdea };
}

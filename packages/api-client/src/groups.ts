import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { throwMapped, requireUserId } from './internal';

/**
 * Raw group data functions, framework-free. Server code (Next.js Server
 * Components / Server Actions) imports THIS module. React hooks that
 * wrap these live in ./groups-hooks so importing the raw functions never
 * pulls @tanstack/react-query into a server bundle.
 */

type HuddleClient = SupabaseClient<Database>;
type GroupRow = Database['public']['Tables']['groups']['Row'];
type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type GroupMemberRole = Database['public']['Enums']['group_member_role'];

// -----------------------------------------------------------------------
// Exported types
// -----------------------------------------------------------------------

export interface GroupWithRole extends GroupRow {
  myRole: GroupMemberRole;
  joinedAt: string;
}

export interface GroupMemberWithProfile {
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  joinedAt: string;
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

// -----------------------------------------------------------------------
// Query key factory — single source of truth for cache keys. Lives here
// (not in groups-hooks) so server code can target the same keys if it
// ever needs to seed or invalidate a client cache.
// -----------------------------------------------------------------------

export const groupQueryKeys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
  members: (id: string) => ['groups', id, 'members'] as const,
};

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

/**
 * Fetch all groups the current user is a member of, including their role.
 * RLS on `groups` already restricts to groups where the caller is a member;
 * the join back to `group_members` retrieves the caller's specific role row.
 */
export async function fetchMyGroups(client: HuddleClient): Promise<GroupWithRole[]> {
  const userId = await requireUserId(client);

  const { data, error } = await client
    .from('groups')
    .select('*, group_members!inner(role, joined_at)')
    .eq('group_members.user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throwMapped(error);

  return (data ?? []).map((row) => {
    const { group_members, ...group } = row;
    const membership = Array.isArray(group_members) ? group_members[0] : group_members;
    return {
      ...group,
      myRole: (membership as GroupMemberRow).role,
      joinedAt: (membership as GroupMemberRow).joined_at,
    };
  });
}

/** Fetch a single group by ID. */
export async function fetchGroup(client: HuddleClient, id: string): Promise<GroupRow> {
  const { data, error } = await client.from('groups').select('*').eq('id', id).single();

  if (error) throwMapped(error);
  return data!;
}

/** Fetch all members of a group with their profile info. */
export async function fetchGroupMembers(
  client: HuddleClient,
  groupId: string,
): Promise<GroupMemberWithProfile[]> {
  const { data, error } = await client
    .from('group_members')
    .select('role, joined_at, user_id, profiles(id, username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) throwMapped(error);

  return (data ?? []).map((row) => ({
    groupId,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    profile: row.profiles as Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>,
  }));
}

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

/**
 * Create a group via the create_group RPC. The DB trigger adds the
 * creator as admin.
 *
 * Why an RPC and not a plain INSERT: `insert().select()` fails 42501 —
 * the RETURNING clause is checked against the groups SELECT policy
 * (is_group_member) before the membership trigger has run. The
 * SECURITY DEFINER function returns the row without that check and
 * always uses auth.uid() as creator.
 */
export async function createGroup(client: HuddleClient, name: string): Promise<GroupRow> {
  const { data, error } = await client.rpc('create_group', { p_name: name });

  if (error) throwMapped(error);
  return data!;
}

/** Rename a group. RLS rejects non-admins (kind: 'unauthorized'). */
export async function renameGroup(
  client: HuddleClient,
  groupId: string,
  name: string,
): Promise<GroupRow> {
  const { data, error } = await client
    .from('groups')
    .update({ name })
    .eq('id', groupId)
    .select()
    .single();

  if (error) throwMapped(error);
  return data!;
}

/** Delete a group. Cascades to members, ideas, decisions, invites. */
export async function deleteGroup(client: HuddleClient, groupId: string): Promise<void> {
  const { error } = await client.from('groups').delete().eq('id', groupId);
  if (error) throwMapped(error);
}

/**
 * Leave a group (delete own membership row).
 * The enforce_last_admin DB trigger raises check_violation (23514 →
 * kind: 'validation') if the caller is the sole admin.
 */
export async function leaveGroup(client: HuddleClient, groupId: string): Promise<void> {
  const userId = await requireUserId(client);

  const { error } = await client
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throwMapped(error);
}

/**
 * Remove another member from a group.
 * RLS blocks non-admins (kind: 'unauthorized'); the enforce_last_admin
 * trigger blocks removing the sole admin (kind: 'validation').
 */
export async function removeMember(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throwMapped(error);
}

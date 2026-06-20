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

export type GroupVisibility = Database['public']['Enums']['group_visibility'];
export type JoinRequestRow = Database['public']['Tables']['group_join_requests']['Row'];
export type JoinRequestStatus = Database['public']['Enums']['join_request_status'];

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

export interface JoinRequestWithProfile {
  id: string;
  groupId: string;
  userId: string;
  status: JoinRequestStatus;
  message: string | null;
  createdAt: string;
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface GroupSearchParams {
  q?: string;
  tags?: string[];
  location?: string;
}

export interface CreateGroupOptions {
  description?: string | null;
  location?: string | null;
  tags?: string[];
  visibility?: GroupVisibility;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  tags?: string[];
  visibility?: GroupVisibility;
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
  discover: (params: GroupSearchParams) => ['groups', 'discover', params] as const,
  joinRequests: (groupId: string) => ['groups', groupId, 'join-requests'] as const,
  myJoinRequests: ['groups', 'my-join-requests'] as const,
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
export async function createGroup(
  client: HuddleClient,
  name: string,
  opts: CreateGroupOptions = {},
): Promise<GroupRow> {
  const { data, error } = await client.rpc('create_group', {
    p_name: name,
    p_description: opts.description ?? undefined,
    p_location: opts.location ?? undefined,
    p_tags: opts.tags ?? undefined,
    p_visibility: opts.visibility ?? undefined,
  });

  if (error) throwMapped(error);
  return data!;
}

/**
 * Update group fields (name/description/location/tags/visibility). RLS
 * rejects non-admins (kind: 'unauthorized'); the normalize trigger +
 * CHECKs enforce field shapes (kind: 'validation').
 */
export async function updateGroup(
  client: HuddleClient,
  groupId: string,
  patch: UpdateGroupInput,
): Promise<GroupRow> {
  const { data, error } = await client
    .from('groups')
    .update(patch)
    .eq('id', groupId)
    .select()
    .single();

  if (error) throwMapped(error);
  return data!;
}

/** Rename a group — thin wrapper over updateGroup (kept for callers). */
export async function renameGroup(
  client: HuddleClient,
  groupId: string,
  name: string,
): Promise<GroupRow> {
  return updateGroup(client, groupId, { name });
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

// -----------------------------------------------------------------------
// Discovery + join requests (public groups)
// -----------------------------------------------------------------------

/**
 * Strip characters that would alter PostgREST or()/ilike filter syntax
 * (commas, parens, wildcards) from a free-text term — defence against
 * filter injection through the search box.
 */
function sanitizeTerm(q: string): string {
  return q.replace(/[,()*%\\]/g, ' ').trim();
}

/**
 * Search PUBLIC groups by free text (name/description/location) plus
 * optional tag/location filters. RLS already limits non-members to
 * public rows; the explicit visibility filter keeps results correct for
 * members too and uses the visibility index.
 */
export async function searchPublicGroups(
  client: HuddleClient,
  params: GroupSearchParams = {},
): Promise<GroupRow[]> {
  let query = client.from('groups').select('*').eq('visibility', 'public');

  const term = sanitizeTerm(params.q ?? '');
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},description.ilike.${like},location.ilike.${like}`);
  }
  const loc = sanitizeTerm(params.location ?? '');
  if (loc) {
    query = query.ilike('location', `%${loc}%`);
  }
  if (params.tags && params.tags.length > 0) {
    query = query.overlaps('tags', params.tags);
  }

  const { data, error } = await query
    .order('member_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throwMapped(error);
  return data ?? [];
}

/**
 * File a request to join a public group. Raises (mapped) on HD004
 * (already a member), HD005 (not public/not found), HD006 (already
 * pending) — the UI maps those by code.
 */
export async function requestToJoin(
  client: HuddleClient,
  groupId: string,
  message?: string,
): Promise<JoinRequestRow> {
  const { data, error } = await client.rpc('request_to_join', {
    p_group_id: groupId,
    p_message: message ?? undefined,
  });

  if (error) throwMapped(error);
  return data!;
}

/** Admin: a group's pending join requests, with requester profiles. */
export async function fetchJoinRequests(
  client: HuddleClient,
  groupId: string,
): Promise<JoinRequestWithProfile[]> {
  const { data, error } = await client
    .from('group_join_requests')
    .select(
      'id, group_id, user_id, status, message, created_at, profiles!group_join_requests_user_id_fkey(id, username, display_name, avatar_url)',
    )
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throwMapped(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    profile: row.profiles as Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>,
  }));
}

/** Admin: approve (→ adds member) or reject a join request. */
export async function respondToJoinRequest(
  client: HuddleClient,
  requestId: string,
  approve: boolean,
): Promise<JoinRequestRow> {
  const { data, error } = await client.rpc('respond_to_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });

  if (error) throwMapped(error);
  return data!;
}

/** The caller's own still-pending join requests (to mark "Requested"). */
export async function fetchMyJoinRequests(client: HuddleClient): Promise<JoinRequestRow[]> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('group_join_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throwMapped(error);
  return data ?? [];
}

/** Withdraw the caller's own pending join request. */
export async function withdrawJoinRequest(client: HuddleClient, requestId: string): Promise<void> {
  const { error } = await client.from('group_join_requests').delete().eq('id', requestId);
  if (error) throwMapped(error);
}

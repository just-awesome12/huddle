import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Raw idea data functions, framework-free (hooks in ./ideas-hooks —
 * same split as groups/invites: server code imports THIS module).
 *
 * Authorization is RLS (Phase 1): members read/insert/update within
 * their groups; delete is proposer-or-admin. Any member may update any
 * field — the trust boundary is the group (Phase 1 decision, upheld in
 * Phase 5; the UI gates edit controls to proposer/admin as UX only).
 */

type IdeaRow = Database['public']['Tables']['ideas']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type IdeaCategory = Database['public']['Enums']['idea_category'];
type IdeaStatus = Database['public']['Enums']['idea_status'];

export interface IdeaFilters {
  status?: IdeaStatus;
  category?: IdeaCategory;
}

/** Idea as listed/shown, with the proposer's public profile. */
export interface IdeaWithProposer extends IdeaRow {
  proposer: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface CreateIdeaParams {
  groupId: string;
  title: string;
  category: IdeaCategory;
  description?: string;
  link?: string;
}

export interface UpdateIdeaParams {
  title?: string;
  description?: string;
  category?: IdeaCategory;
  link?: string;
}

// -----------------------------------------------------------------------
// Query key factory — list keys embed the filters so each filter combo
// caches independently.
// -----------------------------------------------------------------------

export const ideaQueryKeys = {
  forGroup: (groupId: string, filters: IdeaFilters = {}) =>
    [
      'groups',
      groupId,
      'ideas',
      { status: filters.status ?? null, category: filters.category ?? null },
    ] as const,
  allForGroup: (groupId: string) => ['groups', groupId, 'ideas'] as const,
  detail: (ideaId: string) => ['ideas', ideaId] as const,
};

const PROPOSER_SELECT =
  '*, proposer:profiles!ideas_proposed_by_fkey(id, username, display_name, avatar_url)';

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

/** List a group's ideas, newest first, optionally filtered (FR-10). */
export async function fetchGroupIdeas(
  client: HuddleClient,
  groupId: string,
  filters: IdeaFilters = {},
): Promise<IdeaWithProposer[]> {
  let query = client
    .from('ideas')
    .select(PROPOSER_SELECT)
    .eq('group_id', groupId);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.category) query = query.eq('category', filters.category);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throwMapped(error);
  return (data ?? []) as unknown as IdeaWithProposer[];
}

/** Fetch a single idea with its proposer. */
export async function fetchIdea(
  client: HuddleClient,
  ideaId: string,
): Promise<IdeaWithProposer> {
  const { data, error } = await client
    .from('ideas')
    .select(PROPOSER_SELECT)
    .eq('id', ideaId)
    .single();

  if (error) throwMapped(error);
  return data as unknown as IdeaWithProposer;
}

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

/**
 * Create an idea. proposed_by must be the caller (RLS WITH CHECK).
 * Plain INSERT…RETURNING is safe here: the proposer is already a group
 * member, so the SELECT policy passes (no D45-style trigger problem).
 */
export async function createIdea(
  client: HuddleClient,
  params: CreateIdeaParams,
): Promise<IdeaRow> {
  const userId = await requireUserId(client);

  const { data, error } = await client
    .from('ideas')
    .insert({
      group_id: params.groupId,
      proposed_by: userId,
      title: params.title,
      category: params.category,
      description: params.description ?? null,
      link: params.link ?? null,
    })
    .select()
    .single();

  if (error) throwMapped(error);
  return data!;
}

/** Edit an idea's content fields. */
export async function updateIdea(
  client: HuddleClient,
  ideaId: string,
  params: UpdateIdeaParams,
): Promise<IdeaRow> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch.title = params.title;
  if (params.description !== undefined) patch.description = params.description;
  if (params.category !== undefined) patch.category = params.category;
  if (params.link !== undefined) patch.link = params.link;

  const { data, error } = await client
    .from('ideas')
    .update(patch)
    .eq('id', ideaId)
    .select()
    .single();

  if (error) throwMapped(error);
  return data!;
}

/** Change an idea's status (on_radar → done | dismissed, or back). */
export async function updateIdeaStatus(
  client: HuddleClient,
  ideaId: string,
  status: IdeaStatus,
): Promise<IdeaRow> {
  const { data, error } = await client
    .from('ideas')
    .update({ status })
    .eq('id', ideaId)
    .select()
    .single();

  if (error) throwMapped(error);
  return data!;
}

/**
 * Hard-delete an idea. RLS limits this to the proposer or an admin.
 * NOTE (Phase 7 flag): decisions.chosen_idea_id is ON DELETE CASCADE —
 * once decisions exist, deleting a chosen idea would erase history
 * rows. Revisit the FK (likely RESTRICT + "dismiss instead" UX) when
 * the picker ships.
 */
export async function deleteIdea(client: HuddleClient, ideaId: string): Promise<void> {
  const { error } = await client.from('ideas').delete().eq('id', ideaId);
  if (error) throwMapped(error);
}

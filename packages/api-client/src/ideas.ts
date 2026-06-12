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
 * Hard-delete an idea, including its storage photo if one exists
 * (storage objects do NOT cascade with the DB row). The photo removal
 * is best-effort: an orphaned object in a private bucket is a smaller
 * failure than a delete that errors after the row is already gone.
 *
 * NOTE (Phase 7 flag): decisions.chosen_idea_id is ON DELETE CASCADE —
 * once decisions exist, deleting a chosen idea would erase history
 * rows. Revisit the FK (likely RESTRICT + "dismiss instead" UX) when
 * the picker ships.
 */
export async function deleteIdea(
  client: HuddleClient,
  ideaId: string,
  photoPath?: string | null,
): Promise<void> {
  const { error } = await client.from('ideas').delete().eq('id', ideaId);
  if (error) throwMapped(error);

  if (photoPath) {
    await client.storage.from(IDEA_PHOTOS_BUCKET).remove([photoPath]);
  }
}

// -----------------------------------------------------------------------
// Photos (Phase 5.3)
// -----------------------------------------------------------------------

export const IDEA_PHOTOS_BUCKET = 'idea-photos';

/** Signed URLs are short-lived by design (private bucket, D-photo). */
export const IDEA_PHOTO_URL_TTL_SECONDS = 3600;

/** Mirrors the bucket's allowed_mime_types (Phase 1 migration). */
const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isAllowedPhotoType(contentType: string): boolean {
  return contentType in PHOTO_EXTENSIONS;
}

/**
 * Build the object key for an idea photo:
 *   {group_id}/{idea_id}/{unique}.{ext}
 * The group_id prefix is what storage RLS authorizes against. The
 * unique segment only needs collision-resistance within one idea's
 * folder, so a timestamp+random suffix suffices — no crypto dependency
 * (which RN lacks without a polyfill).
 */
export function buildIdeaPhotoPath(
  groupId: string,
  ideaId: string,
  contentType: string,
): string {
  const ext = PHOTO_EXTENSIONS[contentType];
  if (!ext) {
    throwMapped({
      code: '23514',
      message: `unsupported photo type: ${contentType}`,
    });
  }
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${groupId}/${ideaId}/${unique}.${ext}`;
}

export interface UploadIdeaPhotoParams {
  groupId: string;
  ideaId: string;
  /** Already-compressed image bytes. */
  data: Blob | ArrayBuffer;
  contentType: string;
  /** Existing photo to replace; removed (best-effort) after the swap. */
  previousPath?: string | null;
}

/**
 * Upload a photo and point the idea at it. Order matters: upload →
 * update row → remove old object, so a failure never leaves the row
 * referencing a missing object.
 */
export async function uploadIdeaPhoto(
  client: HuddleClient,
  params: UploadIdeaPhotoParams,
): Promise<string> {
  const path = buildIdeaPhotoPath(params.groupId, params.ideaId, params.contentType);

  const { error: uploadError } = await client.storage
    .from(IDEA_PHOTOS_BUCKET)
    .upload(path, params.data, { contentType: params.contentType });
  if (uploadError) throwMapped(uploadError);

  const { error: updateError } = await client
    .from('ideas')
    .update({ photo_path: path })
    .eq('id', params.ideaId);
  if (updateError) {
    // Roll back the orphan object (best-effort) before surfacing.
    await client.storage.from(IDEA_PHOTOS_BUCKET).remove([path]);
    throwMapped(updateError);
  }

  if (params.previousPath) {
    await client.storage.from(IDEA_PHOTOS_BUCKET).remove([params.previousPath]);
  }

  return path;
}

/** Remove an idea's photo: clear the row pointer, then the object. */
export async function removeIdeaPhoto(
  client: HuddleClient,
  ideaId: string,
  photoPath: string,
): Promise<void> {
  const { error } = await client
    .from('ideas')
    .update({ photo_path: null })
    .eq('id', ideaId);
  if (error) throwMapped(error);

  await client.storage.from(IDEA_PHOTOS_BUCKET).remove([photoPath]);
}

/** Create a short-lived signed URL for a photo (private bucket). */
export async function getIdeaPhotoUrl(
  client: HuddleClient,
  photoPath: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(IDEA_PHOTOS_BUCKET)
    .createSignedUrl(photoPath, IDEA_PHOTO_URL_TTL_SECONDS);
  if (error) throwMapped(error);
  return data!.signedUrl;
}

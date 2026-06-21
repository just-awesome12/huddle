import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Raw profile lookup functions, framework-free (hooks in
 * ./profiles-hooks). Currently just username search for the
 * add-by-username invite flow.
 */

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type ProfileSearchResult = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'avatar_url'
>;

export const profileQueryKeys = {
  search: (q: string) => ['profiles', 'search', q] as const,
  detail: (id: string) => ['profiles', id] as const,
};

const AVATARS_BUCKET = 'avatars';

export interface UpdateProfileInput {
  display_name?: string;
  bio?: string | null;
  avatar_url?: string | null;
}

export interface AvatarUpload {
  /** Already-compressed image bytes. */
  data: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
  /** File extension without the dot (jpg/png/webp). */
  ext: string;
}

/** The current user's full profile row. */
export async function fetchProfile(client: HuddleClient, userId: string): Promise<ProfileRow> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
  if (error) throwMapped(error);
  return data!;
}

/** Update the caller's own profile (RLS restricts to own row). */
export async function updateProfile(
  client: HuddleClient,
  patch: UpdateProfileInput,
): Promise<ProfileRow> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throwMapped(error);
  return data!;
}

/**
 * Upload an avatar to the public `avatars` bucket under the caller's
 * folder (`${uid}/...`, the path storage RLS authorizes against) and
 * return its public URL. The caller then saves that URL via updateProfile.
 */
export async function uploadAvatar(client: HuddleClient, params: AvatarUpload): Promise<string> {
  const userId = await requireUserId(client);
  const path = `${userId}/avatar-${Date.now()}.${params.ext}`;
  const { error } = await client.storage
    .from(AVATARS_BUCKET)
    .upload(path, params.data, { contentType: params.contentType, upsert: true });
  if (error) throwMapped(error);
  return client.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Case-insensitive prefix search on usernames, capped at 10 results,
 * excluding the caller. The query is assumed to be pre-validated by
 * usernameSearchSchema ([a-z0-9_]{1,30}); `_` is still escaped here
 * because it is an ILIKE wildcard.
 *
 * NOTE on rate limiting: the web app fronts this with
 * /api/profiles/search (per-user limiter). Mobile calls it directly —
 * PostgREST-level rate limiting lands in Phase 9 (Cloudflare / WAF).
 */
export async function searchProfiles(
  client: HuddleClient,
  q: string,
): Promise<ProfileSearchResult[]> {
  const userId = await requireUserId(client);
  const pattern = `${q.replace(/[\\%_]/g, '\\$&')}%`;

  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', pattern)
    .neq('id', userId)
    .order('username', { ascending: true })
    .limit(10);

  if (error) throwMapped(error);
  return data ?? [];
}

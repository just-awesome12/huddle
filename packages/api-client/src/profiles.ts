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
};

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

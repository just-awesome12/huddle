import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { resolvePublicEnv } from './env';

/**
 * Per-request server-side Supabase client for Next.js.
 *
 * MUST be called once per request — DO NOT cache. The auth cookies
 * are scoped to the incoming request, and reusing a client across
 * requests will leak one user's session into another's response.
 *
 * Usage in a Server Component or Server Action:
 *
 *     const supabase = await createServerSupabaseClient();
 *     const { data: { user } } = await supabase.auth.getUser();
 *
 * Usage in middleware is similar but the cookieAdapter must support
 * write-through to the response. See the middleware adapter below.
 */

/**
 * Cookie adapter shape. Both Next.js cookies() and the middleware
 * request/response pair conform to this — the caller chooses which.
 */
export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: CookieOptions }[]): void;
}

export interface CookieOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
}

/**
 * Create a server-side Supabase client given a cookie adapter.
 *
 * @example Next.js Server Component (cookies() is async in Next 16)
 *   import { cookies } from 'next/headers';
 *   const cookieStore = await cookies();
 *   const supabase = createServerSupabaseClient({
 *     getAll: () => cookieStore.getAll(),
 *     setAll: (toSet) => {
 *       try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
 *       catch { }
 *     },
 *   });
 */
export function createServerSupabaseClient(cookieAdapter: CookieAdapter): SupabaseClient<Database> {
  const { url, publishableKey } = resolvePublicEnv();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieAdapter.getAll(),
      setAll: (cookies) => cookieAdapter.setAll(cookies),
    },
  });
}

/**
 * Re-export the SupabaseClient type so apps importing from
 * @huddle/api-client/server don't need to depend on @supabase/supabase-js
 * directly. The whole point of the api-client package is to be the
 * single seam between apps and Supabase — types belong to that seam.
 */
export type { SupabaseClient } from '@supabase/supabase-js';
export type { Database } from '@huddle/types';

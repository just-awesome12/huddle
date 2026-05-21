import { cookies } from 'next/headers';
import {
  createServerSupabaseClient,
  type SupabaseClient,
  type Database,
  type CookieOptions,
} from '@huddle/api-client/server';

/**
 * Build a server-side Supabase client wired to Next.js cookies().
 *
 * Use in Server Components, Server Actions, and route handlers. Each
 * call creates a fresh client tied to the current request's cookies.
 *
 * Cookie writes inside Server Components throw, so the setAll path
 * swallows that specific error. Server Actions and route handlers
 * are fine — the cookies() API mutates the response in those contexts.
 *
 * The explicit return type prevents TypeScript from generating a
 * non-portable inferred type (TS2742). It comes via @huddle/api-client
 * rather than @supabase/* directly so apps/web doesn't need a direct
 * dependency on the Supabase SDK packages.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createServerSupabaseClient({
    getAll: () => cookieStore.getAll(),
    setAll: (
      toSet: { name: string; value: string; options?: CookieOptions }[],
    ) => {
      try {
        toSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Server Components cannot mutate cookies. Middleware and
        // Server Actions are the legitimate writers; if the write
        // throws here it's because we're in a Server Component
        // context, and the middleware will pick up the fresh tokens
        // on the next request.
      }
    },
  });
}

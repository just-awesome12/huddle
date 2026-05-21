import { NextResponse, type NextRequest } from 'next/server';
import {
  createServerSupabaseClient,
  type CookieOptions,
} from '@huddle/api-client/server';

/**
 * Auth proxy (formerly "middleware" — renamed in Next.js 16).
 *
 * Two jobs:
 *
 *   1. Refresh the auth cookie on every request. The Supabase SSR
 *      helper updates tokens when they're close to expiry; without
 *      this, sessions silently die. The helper does this implicitly
 *      whenever supabase.auth.getUser() is called with a fresh
 *      cookie adapter — which is why we always make the call below
 *      even if we don't use the returned user data.
 *
 *   2. Redirect:
 *      - Unauthenticated requests to (app) routes -> /sign-in
 *      - Authenticated requests to (auth) routes  -> /
 *
 *   The /auth/* paths (callback, error) are PUBLIC — they have to be
 *   reachable in both signed-in and signed-out states. An OAuth user
 *   arrives at /auth/callback with no session yet; the route handler
 *   creates it from the OAuth code.
 */

const PUBLIC_PATHS = new Set(['/sign-in', '/sign-up']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // /auth/callback, /auth/error, and any nested auth route.
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerSupabaseClient({
    getAll: () => request.cookies.getAll(),
    setAll: (
      cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
    ) => {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      );
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Authenticated user trying to visit /sign-in or /sign-up → punt to /.
  // (We do NOT redirect them away from /auth/callback — that path needs
  // to run even when a session is partially established.)
  if (user && PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Unauthenticated user trying to visit a non-public page → punt to /sign-in.
  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and the Next.js internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)',
  ],
};

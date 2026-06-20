import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, type CookieOptions } from '@huddle/api-client/server';

/**
 * Auth proxy (formerly "middleware" — renamed in Next.js 16).
 *
 * Three jobs:
 *
 *   1. Refresh the auth cookie on every request.
 *
 *   2. Redirect:
 *      - Unauthenticated requests to (app) routes -> /sign-in
 *      - Authenticated requests to (auth) routes  -> /
 *
 *   3. Force unfinished users through onboarding. If the user has a
 *      session but their profile.username still matches the placeholder
 *      pattern u_<12hex>, push them to /onboarding before anything else.
 *
 *   The /auth/* paths (callback, error) are PUBLIC — they have to be
 *   reachable in both signed-in and signed-out states.
 */

// Auth pages: reachable signed-out; signed-in users get bounced home.
const PUBLIC_PATHS = new Set(['/sign-in', '/sign-up']);
// Reachable in BOTH states (no auth redirect either way): the public
// marketing landing ("/") and the legal pages (also needed as public
// URLs for the app stores). Signed-in visitors to "/" still get the
// onboarding check below, then the page itself forwards them to /groups.
const ALWAYS_PUBLIC_PATHS = new Set(['/', '/terms', '/privacy']);
const ONBOARDING_PATH = '/onboarding';
const PLACEHOLDER_USERNAME_RE = /^u_[0-9a-f]{12}$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (ALWAYS_PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerSupabaseClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
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

  // Unauthenticated user trying to visit a non-public page → /sign-in.
  // Carry the original path as ?next= so deep links (e.g. invite URLs)
  // survive the auth round-trip. Only the path goes in — the sign-in
  // action re-validates it before redirecting (open-redirect guard).
  if (!user && !isPublicPath(pathname) && pathname !== ONBOARDING_PATH) {
    const signInUrl = new URL('/sign-in', request.url);
    if (pathname !== '/') {
      signInUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(signInUrl);
  }

  // Authenticated user trying to visit /sign-in or /sign-up → /.
  if (user && PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Authenticated but onboarding incomplete → /onboarding.
  // We only check this if the user is signed in AND not already on
  // onboarding (to avoid an infinite loop) AND not on /auth/* (the
  // OAuth callback needs to complete before we can do this check).
  if (user && pathname !== ONBOARDING_PATH && !pathname.startsWith('/auth/')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.username && PLACEHOLDER_USERNAME_RE.test(profile.username)) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
    }
  }

  // If user finished onboarding but is still on /onboarding, send them home.
  if (user && pathname === ONBOARDING_PATH) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.username && !PLACEHOLDER_USERNAME_RE.test(profile.username)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets, the Next.js internals, and
    // the public metadata routes (robots/sitemap/manifest) — auth-walling
    // those would redirect crawlers / install prompts to /sign-in instead
    // of serving the file.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)',
  ],
};

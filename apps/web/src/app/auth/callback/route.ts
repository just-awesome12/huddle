import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

/**
 * OAuth callback handler.
 *
 * Google redirects the user back to this URL with either:
 *   - `?code=<auth code>` on success
 *   - `?error=<error>&error_description=<msg>` on failure or user cancellation
 *
 * On success we call exchangeCodeForSession, which sets the auth
 * cookies via @supabase/ssr's cookie adapter. We then redirect to
 * the app root (or wherever the optional `next` param points).
 *
 * On failure we send them to /auth/error with the reason.
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const next = searchParams.get('next') ?? '/';

  if (error) {
    const desc = searchParams.get('error_description') ?? error;
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(desc)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await getSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  // `next` must be an internal path — strip anything that looks like
  // a full URL or scheme to avoid open-redirect.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${origin}${safeNext}`);
}

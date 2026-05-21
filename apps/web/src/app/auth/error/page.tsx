import Link from 'next/link';

interface PageProps {
  searchParams: Promise<{ reason?: string }>;
}

/**
 * Auth error page. Reachable when:
 *   - OAuth initiation fails (Supabase can't generate the URL)
 *   - The user cancels the Google consent screen
 *   - Google redirects back with an error parameter
 *   - The code exchange fails
 *
 * Note: searchParams is a Promise in Next.js 16 (App Router). Has to be awaited.
 */
export default async function AuthErrorPage({ searchParams }: PageProps) {
  const { reason } = await searchParams;
  const message = friendlyReason(reason);

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Sign-in failed
        </h1>
        <p className="mb-6 text-sm text-slate-600">{message}</p>
        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

function friendlyReason(reason: string | undefined): string {
  if (!reason) return 'Something went wrong while signing you in. Please try again.';
  const lower = reason.toLowerCase();
  if (lower.includes('oauth_init')) {
    return 'Could not start the Google sign-in. Please try again in a moment.';
  }
  if (lower.includes('missing_code')) {
    return 'Google did not return an authorization code. Please try again.';
  }
  if (lower.includes('access_denied') || lower.includes('cancelled')) {
    return 'Google sign-in was cancelled. You can try again any time.';
  }
  // Anything else: show the raw reason. It comes from Supabase or
  // Google and is usually short enough to be useful.
  return `Sign-in failed: ${reason}`;
}

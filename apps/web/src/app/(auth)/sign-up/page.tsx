import Link from 'next/link';
import { SignUpForm } from '@/components/SignUpForm';
import { OAuthProviderButtons } from '@/components/OAuthProviderButtons';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-900">
        Sign-up is misconfigured: <code>NEXT_PUBLIC_TURNSTILE_SITE_KEY</code>{' '}
        is not set in <code>apps/web/.env.local</code>. See the Phase 2.5
        setup instructions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Create your account</h2>
        <p className="text-sm text-slate-600">
          Pick a username and a display name your group will see.
        </p>
      </div>

      <OAuthProviderButtons />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <SignUpForm turnstileSiteKey={siteKey} next={next} />

      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
          className="font-medium text-brand-700 underline"
        >
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}

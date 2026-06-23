import Link from 'next/link';
import { SignInMethods } from '@/components/SignInMethods';
import { OAuthProviderButtons } from '@/components/OAuthProviderButtons';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[28px] font-black text-brand-ink">Welcome back</h1>
        <p className="mt-1 text-[15px] text-muted">Your powwows are waiting.</p>
      </div>

      <OAuthProviderButtons />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-wide text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <SignInMethods next={next} />

      <p className="text-center text-sm text-muted">
        New to Powwow?{' '}
        <Link href={signUpHref} className="font-display font-extrabold text-brand-ink underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

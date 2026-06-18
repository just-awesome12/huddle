import Link from 'next/link';
import { SignInForm } from '@/components/SignInForm';
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
        <h2 className="text-lg font-medium">Sign in</h2>
        <p className="text-sm text-muted">Welcome back.</p>
      </div>

      <OAuthProviderButtons />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-wide text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <SignInForm next={next} />

      <p className="text-sm text-muted">
        New here?{' '}
        <Link href={signUpHref} className="font-medium text-brand-ink underline">
          Create an account
        </Link>
        .
      </p>
    </div>
  );
}

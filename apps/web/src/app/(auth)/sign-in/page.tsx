import Link from 'next/link';
import { SignInForm } from '@/components/SignInForm';
import { OAuthProviderButtons } from '@/components/OAuthProviderButtons';

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Sign in</h2>
        <p className="text-sm text-slate-600">Welcome back.</p>
      </div>

      <OAuthProviderButtons />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <SignInForm />

      <p className="text-sm text-slate-600">
        New here?{' '}
        <Link href="/sign-up" className="font-medium text-slate-900 underline">
          Create an account
        </Link>
        .
      </p>
    </div>
  );
}

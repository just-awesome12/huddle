import Link from 'next/link';
import { SignUpForm } from '@/components/SignUpForm';
import { OAuthProviderButtons } from '@/components/OAuthProviderButtons';

export default function SignUpPage() {
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

      <SignUpForm />

      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-slate-900 underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}

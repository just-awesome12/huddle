'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from '@/actions/auth';
import { EMPTY_AUTH_STATE } from '@/actions/auth-state';
import { Button } from './Button';
import { FormField } from './FormField';
import { TurnstileWidget } from './TurnstileWidget';

interface SignUpFormProps {
  turnstileSiteKey: string;
  /** Validated server-side; see safeNextPath in actions/auth.ts. */
  next?: string;
}

export function SignUpForm({ turnstileSiteKey, next }: SignUpFormProps) {
  const [state, formAction, pending] = useActionState(signUpAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email?.[0]}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password?.[0]}
      />
      <FormField
        label="Username"
        name="username"
        autoComplete="username"
        required
        hint="3–30 characters; lowercase letters, digits, and underscores only."
        error={state.fieldErrors?.username?.[0]}
      />
      <FormField
        label="Display name"
        name="displayName"
        required
        hint="What others will see in your groups."
        error={state.fieldErrors?.displayName?.[0]}
      />

      <TurnstileWidget siteKey={turnstileSiteKey} />

      {state.fieldErrors?.turnstileToken && (
        <p className="text-xs text-red-600" role="alert">
          {state.fieldErrors.turnstileToken[0]}
        </p>
      )}
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Create account
      </Button>
      <p className="text-xs text-muted">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="font-medium text-brand-ink underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="font-medium text-brand-ink underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

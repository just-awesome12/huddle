'use client';

import { useActionState } from 'react';
import { signInAction } from '@/actions/auth';
import { EMPTY_AUTH_STATE } from '@/actions/auth-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface SignInFormProps {
  /** Validated server-side; see safeNextPath in actions/auth.ts. */
  next?: string;
}

export function SignInForm({ next }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(signInAction, EMPTY_AUTH_STATE);

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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password?.[0]}
      />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}

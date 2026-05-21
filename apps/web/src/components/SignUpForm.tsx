'use client';

import { useActionState } from 'react';
import { signUpAction } from '@/actions/auth';
import { EMPTY_AUTH_STATE } from '@/actions/auth-state';
import { Button } from './Button';
import { FormField } from './FormField';

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
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
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Create account
      </Button>
    </form>
  );
}

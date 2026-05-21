'use client';

import { useActionState } from 'react';
import { completeOnboardingAction } from '@/actions/onboarding';
import { EMPTY_ONBOARDING_STATE } from '@/actions/onboarding-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface OnboardingFormProps {
  /** Pre-fill the display name from the OAuth profile if available. */
  suggestedDisplayName?: string;
}

export function OnboardingForm({ suggestedDisplayName }: OnboardingFormProps) {
  const [state, formAction, pending] = useActionState(
    completeOnboardingAction,
    EMPTY_ONBOARDING_STATE,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
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
        defaultValue={suggestedDisplayName ?? ''}
        hint="What others will see in your groups."
        error={state.fieldErrors?.displayName?.[0]}
      />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Continue
      </Button>
    </form>
  );
}

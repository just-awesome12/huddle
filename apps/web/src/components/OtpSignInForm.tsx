'use client';

import { useActionState, useEffect, useState } from 'react';
import { requestOtpAction, verifyOtpAction } from '@/actions/auth';
import { EMPTY_AUTH_STATE, EMPTY_OTP_STATE } from '@/actions/auth-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface OtpSignInFormProps {
  /** Validated server-side; see safeNextPath in actions/auth.ts. */
  next?: string;
}

/**
 * Passwordless sign-in (Phase 15d). Two steps:
 *   1. enter an email → we send a 6-digit code (requestOtpAction)
 *   2. enter the code → verifyOtpAction signs in (and redirects)
 *
 * `step` is local so "Use a different email" can go back; an effect
 * advances to the code step whenever a request succeeds (new state
 * object each submit, so a resend re-advances too).
 */
export function OtpSignInForm({ next }: OtpSignInFormProps) {
  const [reqState, requestAction, reqPending] = useActionState(requestOtpAction, EMPTY_OTP_STATE);
  const [verState, verifyAction, verPending] = useActionState(verifyOtpAction, EMPTY_AUTH_STATE);
  const [step, setStep] = useState<'email' | 'code'>('email');

  useEffect(() => {
    if (reqState.otpSent) setStep('code');
  }, [reqState]);

  const sentEmail = reqState.email ?? '';

  if (step === 'code') {
    return (
      <div className="flex w-full flex-col gap-4">
        <form action={verifyAction} className="flex w-full flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <input type="hidden" name="email" value={sentEmail} />
          <p className="text-sm text-muted">
            We emailed a 6-digit code to <strong className="text-content">{sentEmail}</strong>.
            Enter it below to sign in.
          </p>
          <FormField
            label="6-digit code"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            required
            autoFocus
            error={verState.fieldErrors?.token?.[0]}
          />
          {verState.formError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {verState.formError}
            </p>
          )}
          <Button type="submit" loading={verPending}>
            Verify &amp; sign in
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <form action={requestAction}>
            <input type="hidden" name="email" value={sentEmail} />
            <button
              type="submit"
              className="font-display font-extrabold text-brand-ink underline"
              disabled={reqPending}
            >
              {reqPending ? 'Sending…' : 'Resend code'}
            </button>
          </form>
          <button type="button" className="text-muted underline" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={requestAction} className="flex w-full flex-col gap-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={sentEmail}
        required
        error={reqState.fieldErrors?.email?.[0]}
      />
      {reqState.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {reqState.formError}
        </p>
      )}
      <Button type="submit" loading={reqPending}>
        Email me a code
      </Button>
    </form>
  );
}

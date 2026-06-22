'use client';

import { useState } from 'react';
import { SignInForm } from './SignInForm';
import { OtpSignInForm } from './OtpSignInForm';

/**
 * Toggles between password sign-in and passwordless OTP (Phase 15d).
 * Only one form is mounted at a time so the two `name="email"` inputs
 * never collide (duplicate ids / ambiguous labels). Password stays the
 * default; the email-code path is one click away — the lower auth wall
 * the panel asked for, without disrupting the existing flow.
 */
export function SignInMethods({ next }: { next?: string }) {
  const [method, setMethod] = useState<'password' | 'otp'>('password');

  return (
    <div className="flex w-full flex-col gap-3">
      {method === 'password' ? <SignInForm next={next} /> : <OtpSignInForm next={next} />}

      <button
        type="button"
        onClick={() => setMethod((m) => (m === 'password' ? 'otp' : 'password'))}
        className="text-center text-sm text-muted underline"
      >
        {method === 'password'
          ? 'Email me a code instead (no password)'
          : 'Sign in with a password instead'}
      </button>
    </div>
  );
}

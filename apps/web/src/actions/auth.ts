'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { signUpSchema, signInSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { verifyTurnstileToken } from '@huddle/api-client/turnstile';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { AuthActionState } from './auth-state';

/**
 * Cloudflare publishes always-pass test keys for dev/CI:
 *   https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 *
 * When the configured secret matches the always-passes test secret AND
 * NEXT_PUBLIC_TURNSTILE_TEST_MODE=true, we skip the verify round-trip
 * entirely. The pair must both be true to activate the bypass — that
 * way a misconfigured production with only the test secret set still
 * fails closed.
 */
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';


// =====================================================================
// Sign up
// =====================================================================

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    username: formData.get('username'),
    displayName: formData.get('displayName'),
    turnstileToken: formData.get('turnstileToken'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? '';
  const isTestMode =
    process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE === 'true' &&
    turnstileSecret === TURNSTILE_TEST_SECRET;

  if (!isTestMode) {
    const h = await headers();
    const clientIp =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      undefined;
    const turnstile = await verifyTurnstileToken(
      parsed.data.turnstileToken,
      turnstileSecret,
      clientIp,
    );
    if (!turnstile.success) {
      return {
        formError:
          'Human-verification check failed. Please refresh the page and try again.',
      };
    }
  }
  // In test mode: the client widget populated a dummy token and we
  // skip the Cloudflare round-trip entirely. The full verification
  // path is still tested by the @huddle/api-client/turnstile unit
  // tests (vitest).

  const supabase = await getSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        pending_username: parsed.data.username,
        pending_display_name: parsed.data.displayName,
      },
    },
  });

  if (signUpError) {
    const mapped = mapSupabaseError(signUpError);
    return { formError: friendlyAuthErrorMessage(mapped) };
  }

  if (signUpData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        username: parsed.data.username,
        display_name: parsed.data.displayName,
      })
      .eq('id', signUpData.user.id);

    if (profileError) {
      const mapped = mapSupabaseError(profileError);
      if (mapped.kind === 'conflict') {
        return {
          fieldErrors: {
            username: ['That username is already taken. Try another.'],
          },
        };
      }
      // Any other profile-write error: still allow the redirect; the
      // proxy will catch them with the placeholder username and route
      // them to /onboarding.
    }
  }

  redirect('/');
}


// =====================================================================
// Sign in
// =====================================================================

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    const mapped = mapSupabaseError(signInError);
    return { formError: friendlyAuthErrorMessage(mapped) };
  }

  redirect('/');
}


// =====================================================================
// Sign out
// =====================================================================

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/sign-in');
}


// =====================================================================
// Helpers
// =====================================================================

function friendlyAuthErrorMessage(
  mapped: { kind: string; message: string },
): string {
  const lower = mapped.message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  if (lower.includes('user already registered')) {
    return 'An account with that email already exists. Try signing in.';
  }
  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return mapped.message;
}

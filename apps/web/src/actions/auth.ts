'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { signUpSchema, signInSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { AuthActionState } from './auth-state';


// =====================================================================
// Sign up
// =====================================================================
// Per Phase 2.3 D30: we accept a Turnstile token in the schema so the
// shape matches Phase 2.5, but we do NOT verify it server-side yet.
// Phase 2.5 adds that verification.
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
    // Placeholder until Phase 2.5 wires up the real Turnstile widget.
    turnstileToken: formData.get('turnstileToken') ?? 'dev-placeholder',
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  const { error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Stash the chosen username + display_name in user_metadata so
      // the onboarding step (Phase 2.5) can read them. We do NOT
      // write to profiles directly here — the handle_new_user trigger
      // creates the placeholder profile row.
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

  // Local dev has email confirmation OFF, so signUp returns a session
  // immediately. In production (Phase 9) we'll branch on whether the
  // session exists and route to "check your email" instead. For now
  // we just go to the app.
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
// Helpers (not exported — internal to this server-actions file)
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

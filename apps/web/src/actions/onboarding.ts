'use server';

import { redirect } from 'next/navigation';
import { onboardingSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { OnboardingActionState } from './onboarding-state';

export async function completeOnboardingAction(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = onboardingSchema.safeParse({
    username: formData.get('username'),
    displayName: formData.get('displayName'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Shouldn't happen — the proxy guarantees a session on this route.
    // But defence in depth: bail back to sign-in if it does.
    redirect('/sign-in');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName,
    })
    .eq('id', user.id);

  if (error) {
    const mapped = mapSupabaseError(error);
    // Username already taken → unique-violation maps to 'conflict'.
    if (mapped.kind === 'conflict') {
      return {
        fieldErrors: {
          username: ['That username is already taken. Try another.'],
        },
      };
    }
    return { formError: 'Could not save your profile. Please try again.' };
  }

  redirect('/');
}

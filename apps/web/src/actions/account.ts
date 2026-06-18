'use server';

import { redirect } from 'next/navigation';
import { deleteAccount, SoleAdminError } from '@huddle/api-client/account';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { GroupActionState } from './groups-state';

/**
 * Delete the signed-in user's account (OQ-6). Delegates to the
 * delete-account Edge Function via the ssr client (getUser() first so the
 * caller's JWT is forwarded). On success we sign out and redirect to
 * sign-in; a sole-admin refusal comes back as an inline form error.
 */
export async function deleteAccountAction(
  _prev: GroupActionState,
  _formData: FormData,
): Promise<GroupActionState> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  try {
    await deleteAccount(supabase);
  } catch (e) {
    if (e instanceof SoleAdminError) {
      const names = e.groups.map((g) => g.name).join(', ');
      return {
        formError:
          `You're the only admin of: ${names}. Promote another member to admin, ` +
          `or delete ${e.groups.length === 1 ? 'that group' : 'those groups'}, then try again.`,
      };
    }
    return { formError: 'Could not delete your account. Please try again.' };
  }

  // Account is gone server-side; clear the local session and leave.
  await supabase.auth.signOut();
  redirect('/sign-in?deleted=1');
}

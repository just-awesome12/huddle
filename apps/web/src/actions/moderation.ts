'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { reportIdeaSchema } from '@huddle/validation';
import { reportIdea, blockUser, unblockUser } from '@huddle/api-client/moderation';
import { isHuddleError } from '@huddle/api-client/errors';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { ModerationActionState } from './moderation-state';
import type { GroupActionState } from './groups-state';

/** Report an idea (OQ-5). A duplicate report is treated as success. */
export async function reportIdeaAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = reportIdeaSchema.safeParse({
    ideaId: formData.get('ideaId'),
    reason: formData.get('reason'),
    details: formData.get('details') ?? '',
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await reportIdea(supabase, parsed.data);
  } catch (e) {
    // Unique (reporter, idea) → already reported; treat as success.
    if (!(isHuddleError(e) && e.huddle.kind === 'conflict')) {
      return { formError: 'Could not submit your report. Please try again.' };
    }
  }
  return { ok: true };
}

/**
 * Block a user. Their ideas become invisible to the caller (RLS), so we
 * redirect back to the group rather than leaving them on a now-404 idea.
 */
export async function blockUserAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const blockedId = String(formData.get('blockedId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await blockUser(supabase, blockedId);
  } catch {
    return { formError: 'Could not block this person. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

/** Unblock a user (from the account page). */
export async function unblockUserAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const blockedId = String(formData.get('blockedId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await unblockUser(supabase, blockedId);
  } catch {
    return { formError: 'Could not unblock this person. Please try again.' };
  }

  revalidatePath('/account');
  return {};
}

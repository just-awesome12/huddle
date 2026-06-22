'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createInviteSchema, acceptInviteSchema, parseEmailList } from '@huddle/validation';
import { isHuddleError } from '@huddle/api-client/errors';
import {
  createInvite,
  revokeInvite,
  acceptInvite,
  inviteErrorKind,
} from '@huddle/api-client/invites';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { InviteActionState, BulkInviteState } from './invites-state';

export async function createInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const rawEmail = formData.get('invitedEmail');
  const rawUserId = formData.get('invitedUserId');
  const parsed = createInviteSchema.safeParse({
    groupId: formData.get('groupId'),
    // Empty input means a plain link invite, not an empty email.
    invitedEmail: typeof rawEmail === 'string' && rawEmail.trim() !== '' ? rawEmail : undefined,
    invitedUserId: typeof rawUserId === 'string' && rawUserId !== '' ? rawUserId : undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  let token: string;
  try {
    const invite = await createInvite(supabase, {
      groupId: parsed.data.groupId,
      invitedEmail: parsed.data.invitedEmail,
      invitedUserId: parsed.data.invitedUserId,
    });
    token = invite.token;
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'conflict') {
      return { formError: 'That person is already a member of this group.' };
    }
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only group admins can create invites.' };
    }
    return { formError: 'Could not create the invite. Please try again.' };
  }

  revalidatePath(`/groups/${parsed.data.groupId}/invite`);
  return { createdToken: token };
}

/**
 * Bulk invite (15e): paste many emails at once. Partial success — invite
 * every parseable, non-duplicate email; report unparseable tokens and any
 * that couldn't be invited (e.g. already a member). RLS still enforces
 * admin-only invite creation.
 */
export async function bulkInviteAction(
  _prev: BulkInviteState,
  formData: FormData,
): Promise<BulkInviteState> {
  const groupId = String(formData.get('groupId') ?? '');
  const { valid, invalid } = parseEmailList(String(formData.get('emails') ?? ''));

  if (valid.length === 0) {
    return {
      error: invalid.length > 0 ? 'No valid email addresses found.' : 'Enter at least one email.',
      invalid,
    };
  }

  const supabase = await getSupabaseServerClient();
  let sent = 0;
  const skipped: string[] = [];
  for (const email of valid) {
    try {
      await createInvite(supabase, { groupId, invitedEmail: email });
      sent += 1;
    } catch (e) {
      if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
        return { error: 'Only group admins can create invites.' };
      }
      // already-a-member (conflict) or any other per-email failure.
      skipped.push(email);
    }
  }

  revalidatePath(`/groups/${groupId}/invite`);
  return { sent, invalid, skipped };
}

export async function revokeInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const inviteId = String(formData.get('inviteId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await revokeInvite(supabase, inviteId);
  } catch {
    return { formError: 'Could not revoke the invite. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}/invite`);
  return {};
}

export async function acceptInviteAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const parsed = acceptInviteSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success) {
    return { formError: 'That invite link is not valid.' };
  }

  const supabase = await getSupabaseServerClient();
  let groupId: string;
  try {
    const group = await acceptInvite(supabase, parsed.data.token);
    groupId = group.id;
  } catch (e) {
    switch (inviteErrorKind(e)) {
      case 'not_found':
        return { formError: 'That invite link is not valid.' };
      case 'expired':
        return { formError: 'This invite has expired. Ask for a new one.' };
      case 'already_used':
        return { formError: 'This invite has already been used. Ask for a new one.' };
      case 'wrong_user':
        return {
          formError:
            'This invite was sent to a different account. Check that you are signed in with the right one.',
        };
      case 'already_member':
        return { formError: "You're already a member of this group." };
      default:
        return { formError: 'Could not accept the invite. Please try again.' };
    }
  }

  revalidatePath('/groups');
  redirect(`/groups/${groupId}`);
}

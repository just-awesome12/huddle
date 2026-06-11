'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createGroupSchema } from '@huddle/validation';
import { isHuddleError } from '@huddle/api-client/errors';
import {
  createGroup,
  renameGroup,
  deleteGroup,
  leaveGroup,
  removeMember,
} from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { GroupActionState } from './groups-state';

export async function createGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const parsed = createGroupSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  let groupId: string;
  try {
    const group = await createGroup(supabase, parsed.data.name);
    groupId = group.id;
  } catch {
    return { formError: 'Could not create the group. Please try again.' };
  }

  revalidatePath('/groups');
  redirect(`/groups/${groupId}`);
}

export async function renameGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const parsed = createGroupSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await renameGroup(supabase, groupId, parsed.data.name);
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only group admins can rename a group.' };
    }
    return { formError: 'Could not rename the group. Please try again.' };
  }

  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function deleteGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await deleteGroup(supabase, groupId);
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only group admins can delete a group.' };
    }
    return { formError: 'Could not delete the group. Please try again.' };
  }

  revalidatePath('/groups');
  redirect('/groups');
}

export async function leaveGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await leaveGroup(supabase, groupId);
  } catch (e) {
    // The enforce_last_admin trigger rejects a sole admin leaving
    // (check_violation → kind 'validation').
    if (isHuddleError(e) && e.huddle.kind === 'validation') {
      return {
        formError:
          "You're the only admin. Promote another member to admin first, or delete the group.",
      };
    }
    return { formError: 'Could not leave the group. Please try again.' };
  }

  revalidatePath('/groups');
  redirect('/groups');
}

export async function removeMemberAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const userId = String(formData.get('userId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await removeMember(supabase, groupId, userId);
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'validation') {
      return {
        formError:
          'That member is the only admin. Promote someone else to admin first.',
      };
    }
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only group admins can remove members.' };
    }
    return { formError: 'Could not remove that member. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

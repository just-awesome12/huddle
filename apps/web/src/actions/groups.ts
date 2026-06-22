'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createGroupSchema, updateGroupSchema } from '@huddle/validation';
import { isHuddleError } from '@huddle/api-client/errors';
import {
  createGroup,
  updateGroup,
  uploadGroupCover,
  deleteGroup,
  leaveGroup,
  removeMember,
  requestToJoin,
  respondToJoinRequest,
  withdrawJoinRequest,
  type UpdateGroupInput,
} from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { GroupActionState } from './groups-state';

/** Parse the create/edit group form fields into the schema shape. */
function parseGroupForm(formData: FormData) {
  return {
    name: formData.get('name') ?? undefined,
    description: (formData.get('description') as string | null) ?? undefined,
    location: (formData.get('location') as string | null) ?? undefined,
    tags: String(formData.get('tags') ?? '').split(','),
    visibility: (formData.get('visibility') as string | null) ?? undefined,
    emoji: (formData.get('emoji') as string | null) ?? undefined,
    color: (formData.get('color') as string | null) ?? undefined,
  };
}

const COVER_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function createGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const parsed = createGroupSchema.safeParse(parseGroupForm(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  let groupId: string;
  try {
    const group = await createGroup(supabase, parsed.data.name, {
      description: parsed.data.description,
      location: parsed.data.location,
      tags: parsed.data.tags,
      visibility: parsed.data.visibility,
    });
    groupId = group.id;
  } catch {
    return { formError: 'Could not create the group. Please try again.' };
  }

  revalidatePath('/groups');
  redirect(`/groups/${groupId}`);
}

export async function updateGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const parsed = updateGroupSchema.safeParse(parseGroupForm(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  const patch: UpdateGroupInput = { ...parsed.data };
  try {
    const cover = formData.get('cover');
    if (cover instanceof File && cover.size > 0) {
      const ext = COVER_EXT[cover.type];
      if (!ext) return { formError: 'Cover must be a JPEG, PNG, or WebP image.' };
      patch.cover_photo_path = await uploadGroupCover(supabase, groupId, {
        data: cover,
        contentType: cover.type,
        ext,
      });
    }
    await updateGroup(supabase, groupId, patch);
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only group admins can edit a group.' };
    }
    return { formError: 'Could not save changes. Please try again.' };
  }

  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  return { success: true };
}

/**
 * Toggle lite mode for a group (16d). A dedicated on/off action rather than
 * a checkbox in the partial-update form, where an unchecked box ("set false")
 * is indistinguishable from "no change". Admin-gated by RLS.
 */
export async function setLiteModeAction(
  groupId: string,
  liteMode: boolean,
): Promise<{ ok: boolean }> {
  const supabase = await getSupabaseServerClient();
  try {
    await updateGroup(supabase, groupId, { lite_mode: liteMode });
  } catch {
    return { ok: false };
  }
  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  return { ok: true };
}

/** Discovery: request to join a public group (plain action). */
export async function requestJoinAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await requestToJoin(supabase, groupId);
  } catch {
    // Already a member / already pending / not public — the recomputed
    // page state reflects the correct button on revalidate.
  }
  revalidatePath('/discover');
}

/** Discovery: withdraw the caller's own pending request (plain action). */
export async function withdrawJoinAction(formData: FormData): Promise<void> {
  const requestId = String(formData.get('requestId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await withdrawJoinRequest(supabase, requestId);
  } catch {
    // ignore — revalidate reflects the truth
  }
  revalidatePath('/discover');
}

/** Admin: approve or reject a join request (plain action). */
export async function respondJoinRequestAction(formData: FormData): Promise<void> {
  const requestId = String(formData.get('requestId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  const approve = String(formData.get('approve') ?? '') === 'true';
  const supabase = await getSupabaseServerClient();
  try {
    await respondToJoinRequest(supabase, requestId, approve);
  } catch {
    // ignore — admin-only; revalidate reflects the result
  }
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath(`/groups/${groupId}`);
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
        formError: 'That member is the only admin. Promote someone else to admin first.',
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

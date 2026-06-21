'use server';

import { revalidatePath } from 'next/cache';
import { postBodySchema } from '@huddle/validation';
import { addGroupPost, deleteGroupPost } from '@huddle/api-client/posts';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PostActionState } from './posts-state';
import type { GroupActionState } from './groups-state';

export async function addPostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const parsed = postBodySchema.safeParse(formData.get('body'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Post cannot be empty' };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await addGroupPost(supabase, { groupId, body: parsed.data });
  } catch {
    return { error: 'Could not post. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}/wall`);
  return { ok: true };
}

export async function deletePostAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const postId = String(formData.get('postId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await deleteGroupPost(supabase, postId);
  } catch {
    return { formError: 'Could not delete the post.' };
  }
  revalidatePath(`/groups/${groupId}/wall`);
  return {};
}

'use server';

import { revalidatePath } from 'next/cache';
import { createCommentSchema } from '@huddle/validation';
import { addComment, deleteComment } from '@huddle/api-client/comments';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { CommentActionState } from './comments-state';

/** Post a comment on an idea (Phase 11). */
export async function addCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const parsed = createCommentSchema.safeParse({
    ideaId: formData.get('ideaId'),
    groupId: formData.get('groupId'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await addComment(supabase, parsed.data);
  } catch {
    return { formError: 'Could not post your comment. Please try again.' };
  }

  revalidatePath(`/groups/${parsed.data.groupId}/ideas/${parsed.data.ideaId}`);
  return { ok: true };
}

/**
 * Delete a comment (RLS enforces author-or-admin). Bound with
 * groupId/ideaId/commentId; signature matches a plain RSC form action.
 */
export async function deleteCommentAction(
  groupId: string,
  ideaId: string,
  commentId: string,
  _formData: FormData,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  try {
    await deleteComment(supabase, commentId);
  } catch {
    // RLS may reject (not author/admin) — surface nothing, just refresh.
  }
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
}

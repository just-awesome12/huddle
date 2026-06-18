/**
 * State for the add-comment Server Action. Lives outside the 'use server'
 * file (which may only export async functions).
 */
export interface CommentActionState {
  ok?: boolean;
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
}

export const EMPTY_COMMENT_STATE: CommentActionState = {};

/**
 * Shared types and constants for the idea Server Actions.
 * Lives outside the 'use server' file because that file can only
 * export async functions (learned in Phase 2.3).
 */

export interface IdeaActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  /** Set by quick-add to signal success without navigating away. */
  ok?: boolean;
}

export const EMPTY_IDEA_STATE: IdeaActionState = {};

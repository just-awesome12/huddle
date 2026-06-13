/**
 * Shared types and constants for the idea Server Actions.
 * Lives outside the 'use server' file because that file can only
 * export async functions (learned in Phase 2.3).
 */

export interface IdeaActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
}

export const EMPTY_IDEA_STATE: IdeaActionState = {};

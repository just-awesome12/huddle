/**
 * Shared types and constants for the group Server Actions.
 * Lives outside the 'use server' file because that file can only
 * export async functions (learned in Phase 2.3).
 */

export interface GroupActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  /** Set after a non-redirecting mutation succeeds (e.g. rename). */
  success?: boolean;
}

export const EMPTY_GROUP_STATE: GroupActionState = {};

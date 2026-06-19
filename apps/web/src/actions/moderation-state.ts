/**
 * Shared state for the moderation Server Actions (report). Lives outside
 * the 'use server' file (which may only export async functions).
 */
export interface ModerationActionState {
  ok?: boolean;
  formError?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export const EMPTY_MODERATION_STATE: ModerationActionState = {};

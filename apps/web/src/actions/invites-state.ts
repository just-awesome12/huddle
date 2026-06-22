/**
 * Shared types and constants for the invite Server Actions.
 * Lives outside the 'use server' file because that file can only
 * export async functions (learned in Phase 2.3).
 */

export interface InviteActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  /** Set by createInviteAction so the UI can show + copy the new link. */
  createdToken?: string;
}

export const EMPTY_INVITE_STATE: InviteActionState = {};

/**
 * Bulk invite (15e). Partial success: `sent` succeeded; `invalid` were
 * unparseable tokens; `skipped` were valid emails that couldn't be invited
 * (e.g. already a member).
 */
export interface BulkInviteState {
  error?: string;
  sent?: number;
  invalid?: string[];
  skipped?: string[];
}

export const EMPTY_BULK_INVITE_STATE: BulkInviteState = {};

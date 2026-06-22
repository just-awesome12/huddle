/**
 * Shared state for the poll Server Actions (the 'use server' file can only
 * export async functions, so the type lives here).
 */
export interface PollActionState {
  error?: string;
  ok?: boolean;
}

export const EMPTY_POLL_STATE: PollActionState = {};

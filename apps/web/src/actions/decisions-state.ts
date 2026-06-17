/**
 * Shared types for the picker Server Action. Lives outside the
 * 'use server' file because that file may only export async functions
 * (Phase 2.3 lesson).
 */

import type { ChosenIdeaSummary } from '@huddle/api-client/decisions';

export type PickerActionState =
  | { status: 'idle' }
  /** No on_radar ideas matched the options — friendly empty state. */
  | { status: 'no_candidates' }
  /** A pick was recorded; `chosen` is the winning idea. */
  | { status: 'picked'; chosen: ChosenIdeaSummary }
  | { status: 'error'; message: string };

export const EMPTY_PICKER_STATE: PickerActionState = { status: 'idle' };

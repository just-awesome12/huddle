/**
 * Shared types and constants for the onboarding Server Action.
 * Lives outside the 'use server' file because that file can only
 * export async functions (learned in Phase 2.3).
 */

export interface OnboardingActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
}

export const EMPTY_ONBOARDING_STATE: OnboardingActionState = {};

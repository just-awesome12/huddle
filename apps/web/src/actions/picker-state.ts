/**
 * Result type for the picker Server Action. Lives outside the
 * 'use server' file (which may only export async functions).
 */
export type PickerActionResult =
  | { ok: true; chosenIdeaId: string }
  | { ok: false; error: 'too_few_candidates'; count: number }
  | { ok: false; error: 'forbidden' | 'generic' };

import { z } from 'zod';

/**
 * Display name validation matching the database CHECK constraint:
 *   length(display_name) between 1 and 60.
 *
 * Free-form text — no character restrictions beyond length and trim.
 */
export const displayNameSchema = z
  .string({ required_error: 'Display name is required' })
  .trim()
  .min(1, 'Display name is required')
  .max(60, 'Display name must be at most 60 characters');

export type DisplayName = z.infer<typeof displayNameSchema>;

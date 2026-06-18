import { z } from 'zod';

/**
 * Username validation matching the database CHECK constraint:
 *   - 3 to 30 characters
 *   - Only lowercase letters, digits, and underscore
 *   - Lowercased before validation so mixed-case input passes
 *
 * The DB trigger `profiles_lowercase_username` also lowercases on
 * insert/update, so the database is the source of truth. This schema
 * mirrors the rule for client-side feedback before the round-trip.
 */
export const usernameSchema = z
  .string({ required_error: 'Username is required' })
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, digits, and underscores');

export type Username = z.infer<typeof usernameSchema>;

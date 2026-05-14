import { z } from 'zod';
import { usernameSchema } from './username';
import { displayNameSchema } from './display-name';

/**
 * Email schema.
 * Lower-cased and trimmed before validation. Zod's built-in email check
 * is good enough — we're not trying to be more strict than RFC 5322.
 */
const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

/**
 * Password schema.
 * - Minimum 8 characters per modern NIST guidance.
 * - No composition requirements (uppercase, digit, etc.) — those push
 *   users toward predictable patterns ("Password1!").
 * - Maximum 72 characters because bcrypt (used by Supabase Auth)
 *   truncates beyond 72 bytes and would silently weaken longer passwords.
 */
const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

/**
 * Sign-up form.
 * Username and display name are collected up front so the placeholder
 * profile (created by the handle_new_user trigger with username
 * `u_<12hex>`) gets immediately replaced.
 */
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  /**
   * Cloudflare Turnstile response token. Required at the schema level
   * so the form can't be submitted without it. Server-side verification
   * happens in a route handler in Phase 2.5.
   */
  turnstileToken: z
    .string({ required_error: 'Please complete the human-verification check' })
    .min(1, 'Please complete the human-verification check'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Sign-in form. Just email + password; OAuth flows have no form payload.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
  // No min length on sign-in — if the user has an existing weak password
  // we still let them sign in. Length policy is enforced at sign-up.
});

export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Password reset request. Phase 2 does not implement the full reset
 * flow — Supabase Auth handles the email side. We just need to
 * validate the email input on the request form.
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

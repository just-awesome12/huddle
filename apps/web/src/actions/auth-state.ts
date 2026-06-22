/**
 * Shared types and constants for the auth Server Actions.
 *
 * This file is NOT marked 'use server' — a server-actions file can
 * only export async functions, so the type and the EMPTY constant
 * have to live separately. Both the actions file and the client
 * form components import from here.
 */

/**
 * Common shape returned by every auth action. The form on the client
 * inspects this to display field-level errors and to know when to stop
 * showing a loading state.
 *
 * - On success, the action redirects, so the form never receives a
 *   "success" state. Callers should treat the absence of `error` as
 *   "still in flight or already navigated."
 * - `fieldErrors` carries Zod field-level messages.
 * - `formError` is the top-level error message (e.g., "wrong password").
 */
export interface AuthActionState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
}

/**
 * Strongly-typed "no prior state" value for useActionState. Imported
 * by the client form components so they don't have to construct an
 * empty object literal at each call site.
 */
export const EMPTY_AUTH_STATE: AuthActionState = {};

/**
 * State for the OTP request step (Phase 15d). Unlike the other auth
 * actions, a successful request does NOT redirect — it advances the form
 * to the code-entry step — so it needs a success channel:
 * - `otpSent` flips true once the code email is on its way.
 * - `email` is echoed back so the code step can submit it and show
 *   "sent to <email>".
 */
export interface OtpRequestState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  otpSent?: boolean;
  email?: string;
}

export const EMPTY_OTP_STATE: OtpRequestState = {};

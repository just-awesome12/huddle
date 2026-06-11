import { isHuddleError } from '@huddle/api-client/errors';

/**
 * Map a group-mutation error to inline copy (D41 — no toasts).
 * The enforce_last_admin trigger surfaces as kind 'validation'
 * (check_violation 23514) when a sole admin tries to leave or be
 * removed; everything else gets the screen's fallback message.
 */
export function groupErrorMessage(
  error: unknown,
  fallback: string,
  soleAdminMessage?: string,
): string {
  if (soleAdminMessage && isHuddleError(error) && error.huddle.kind === 'validation') {
    return soleAdminMessage;
  }
  return fallback;
}

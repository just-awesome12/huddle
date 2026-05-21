/**
 * Cloudflare Turnstile server-side verification.
 *
 * The Turnstile widget on the client posts a token with the form.
 * The server MUST verify that token against Cloudflare's siteverify
 * endpoint before trusting the submission. Tokens are single-use
 * and expire after a few minutes.
 *
 * Documented at:
 *   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * The secret key (TURNSTILE_SECRET_KEY env var) is server-side only.
 * Never expose it to the browser.
 */

export interface TurnstileVerifyResult {
  /** True if the token is valid; false otherwise. */
  success: boolean;
  /** Cloudflare's error codes when success=false (e.g., "timeout-or-duplicate"). */
  errorCodes: string[];
  /**
   * The action the user performed. Useful for differentiating widgets
   * (e.g., one for sign-up, one for password-reset) when they share
   * the same secret. We don't currently use this.
   */
  action?: string;
  /** Cloudflare-issued challenge timestamp; can be used to enforce freshness. */
  challengeTimestamp?: string;
  /** Hostname Cloudflare saw on the client (lets server confirm origin). */
  hostname?: string;
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile token by calling Cloudflare's siteverify API.
 *
 * Returns a TurnstileVerifyResult. NEVER throws on verification
 * failure — failure is a normal outcome and the caller should reject
 * the form submission with a user-friendly error. Throws only on
 * network problems where we can't reach Cloudflare at all.
 *
 * @param token The cf-turnstile-response from the client form.
 * @param secret The TURNSTILE_SECRET_KEY env var.
 * @param remoteIp Optional client IP for additional anti-fraud signal.
 */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }
  if (!secret) {
    // Misconfigured server. Don't accept the form.
    return { success: false, errorCodes: ['missing-input-secret'] };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    // Cloudflare returned a non-2xx — treat as a soft fail. The
    // surrounding code will surface a generic "try again" message.
    return { success: false, errorCodes: [`http-${response.status}`] };
  }

  const raw = (await response.json()) as {
    success: boolean;
    'error-codes'?: string[];
    action?: string;
    challenge_ts?: string;
    hostname?: string;
  };

  return {
    success: raw.success === true,
    errorCodes: raw['error-codes'] ?? [],
    action: raw.action,
    challengeTimestamp: raw.challenge_ts,
    hostname: raw.hostname,
  };
}

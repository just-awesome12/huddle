import { assertTurnstileProductionSafe } from '@huddle/api-client/turnstile';

/**
 * Next.js boot hook (runs once when the server starts). Phase 9: fail
 * closed if production is misconfigured to bypass human verification —
 * better a loud refusal to boot than silently accepting every sign-up
 * (resolves D38).
 */
export async function register(): Promise<void> {
  assertTurnstileProductionSafe({
    nodeEnv: process.env.NODE_ENV,
    testModeFlag: process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE,
    secret: process.env.TURNSTILE_SECRET_KEY,
  });
}

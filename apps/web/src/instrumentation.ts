import * as Sentry from '@sentry/nextjs';
import { assertTurnstileProductionSafe } from '@huddle/api-client/turnstile';

/**
 * Next.js boot hook (runs once when the server starts).
 *
 * Phase 9: fail closed if production is misconfigured to bypass human
 * verification — better a loud refusal to boot than silently accepting
 * every sign-up (resolves D38).
 *
 * Phase 10: initialise Sentry per runtime (DSN-gated; no-op until
 * NEXT_PUBLIC_SENTRY_DSN is set).
 */
export async function register(): Promise<void> {
  assertTurnstileProductionSafe({
    nodeEnv: process.env.NODE_ENV,
    testModeFlag: process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE,
    secret: process.env.TURNSTILE_SECRET_KEY,
  });

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Captures errors thrown in Server Components / route handlers (no-op
// without a DSN).
export const onRequestError = Sentry.captureRequestError;

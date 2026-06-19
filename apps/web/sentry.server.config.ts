import * as Sentry from '@sentry/nextjs';

/**
 * Server-side Sentry init (Phase 10). DSN-gated — a no-op until
 * NEXT_PUBLIC_SENTRY_DSN is set, so this is safe to ship before the
 * Sentry account exists. PII scrubbing per the Phase 9 posture.
 * (next.config is intentionally NOT wrapped with withSentryConfig yet —
 * that's only needed for source-map upload, which needs an auth token.)
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

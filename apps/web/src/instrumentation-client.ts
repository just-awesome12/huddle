import * as Sentry from '@sentry/nextjs';

/** Client-side Sentry init (Phase 10). DSN-gated — no-op until
 *  NEXT_PUBLIC_SENTRY_DSN is set. */
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

// Lets Sentry tie client-side navigations to errors (no-op without a DSN).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

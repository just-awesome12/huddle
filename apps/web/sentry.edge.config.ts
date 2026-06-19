import * as Sentry from '@sentry/nextjs';

/** Edge-runtime Sentry init (proxy/middleware). DSN-gated — see
 *  sentry.server.config.ts. */
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

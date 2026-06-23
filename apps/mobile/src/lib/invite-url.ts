/**
 * Build the shareable web URL for an invite token.
 *
 * Invites are shared as WEB links (https://…/invites/<token>) rather
 * than powwow:// scheme links, because a web URL works for recipients
 * without the app installed. The mobile app itself opens the same path
 * via the powwow:// scheme / universal links (Phase 10).
 *
 * EXPO_PUBLIC_WEB_URL points at the web app origin; defaults to the
 * local dev server.
 */
export function inviteWebUrl(token: string): string {
  const origin = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  return `${origin.replace(/\/$/, '')}/invites/${token}`;
}

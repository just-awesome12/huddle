// =====================================================================
// Push notification logic — pure, environment-agnostic.
// =====================================================================
// The send-push Edge Function (Deno) is the only caller in production,
// but everything here is dependency-free so it's exhaustively unit-
// tested without a stack. Mirrored for Deno at
// supabase/functions/_shared/notifications.ts (drift-guarded in tests).
// =====================================================================

/** The notifiable events. */
export type NotificationEvent =
  | 'new_idea'
  | 'picker_ran'
  | 'group_invite'
  | 'new_comment'
  | 'join_request'
  | 'join_approved'
  | 'reaction'
  | 'rsvp'
  | 'mention'
  | 'nudge';

/** A user's per-event preferences. Columns mirror notification_prefs. */
export interface NotificationPrefs {
  new_idea: boolean;
  picker_ran: boolean;
  group_invite: boolean;
  new_comment: boolean;
  join_request: boolean;
  join_approved: boolean;
  reaction: boolean;
  rsvp: boolean;
  mention: boolean;
  nudge: boolean;
}

/** Absent prefs row = opted in to everything (D: missing row = default-on). */
export const DEFAULT_PREFS: NotificationPrefs = {
  new_idea: true,
  picker_ran: true,
  group_invite: true,
  new_comment: true,
  join_request: true,
  join_approved: true,
  reaction: true,
  rsvp: true,
  mention: true,
  nudge: true,
};

/**
 * Extract @mentions from body text (Phase 16c). Returns unique, lowercased
 * usernames matching usernameSchema (3..30 lowercase/digit/underscore).
 * Used by send-push to resolve mention-push recipients; the apps render
 * highlights with their own (identical) pattern.
 */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /@([a-z0-9_]{3,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1]!.toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Whether a user with these prefs wants `event`. Null prefs → default. */
export function shouldNotify(
  prefs: NotificationPrefs | null | undefined,
  event: NotificationEvent,
): boolean {
  return (prefs ?? DEFAULT_PREFS)[event];
}

/** One device's eligibility input: who owns the token, their prefs, and
 * whether they've muted this group (Phase 15b — orthogonal to prefs). */
export interface Recipient {
  userId: string;
  expoToken: string;
  prefs: NotificationPrefs | null;
  muted?: boolean;
}

/**
 * The tokens that should actually receive `event`: everyone except the
 * actor who triggered it, who hasn't muted this group and hasn't opted
 * out of the event. A user with several devices yields several tokens.
 */
export function selectRecipientTokens(
  recipients: Recipient[],
  event: NotificationEvent,
  actorId: string | null,
  excludeUserIds: readonly string[] = [],
): string[] {
  const excluded = new Set(excludeUserIds);
  return recipients
    .filter(
      (r) =>
        r.userId !== actorId && !excluded.has(r.userId) && !r.muted && shouldNotify(r.prefs, event),
    )
    .map((r) => r.expoToken);
}

/** Expo Push message shape (the subset we send). */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data?: Record<string, unknown>;
}

export interface NotificationContent {
  title: string;
  body: string;
  /** Routing payload read on notification tap (e.g. a deep-link path). */
  data?: Record<string, unknown>;
}

/** Build one Expo message per token from shared content. */
export function buildExpoMessages(tokens: string[], content: NotificationContent): ExpoMessage[] {
  return tokens.map((to) => ({
    to,
    title: content.title,
    body: content.body,
    sound: 'default',
    ...(content.data ? { data: content.data } : {}),
  }));
}

// -----------------------------------------------------------------------
// Web Push (Phase 15) — second delivery channel, same selection rules.
// -----------------------------------------------------------------------

/** A browser's W3C Push subscription (the bits send-push needs to deliver). */
export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** One browser's eligibility input: who owns the subscription, prefs, mute. */
export interface WebSubscriptionRecipient {
  userId: string;
  subscription: WebPushSubscription;
  prefs: NotificationPrefs | null;
  muted?: boolean;
}

/**
 * The web subscriptions that should receive `event`: same rule as
 * selectRecipientTokens (everyone except the actor, not muted, not opted
 * out), but carrying subscriptions instead of Expo tokens.
 */
export function selectWebSubscriptions(
  recipients: WebSubscriptionRecipient[],
  event: NotificationEvent,
  actorId: string | null,
  excludeUserIds: readonly string[] = [],
): WebPushSubscription[] {
  const excluded = new Set(excludeUserIds);
  return recipients
    .filter(
      (r) =>
        r.userId !== actorId && !excluded.has(r.userId) && !r.muted && shouldNotify(r.prefs, event),
    )
    .map((r) => r.subscription);
}

/** The JSON payload a browser service worker reads to render the notification. */
export function buildWebPushPayload(content: NotificationContent): string {
  return JSON.stringify({
    title: content.title,
    body: content.body,
    ...(content.data ? { data: content.data } : {}),
  });
}

/** Expo accepts at most 100 messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100;

/** Split a list into chunks of at most `size` (last chunk may be smaller). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk: size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

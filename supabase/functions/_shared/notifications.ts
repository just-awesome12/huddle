// =====================================================================
// Push notification logic — Deno mirror of packages/core/src/notifications.ts
// =====================================================================
// Edge Functions can't import the pnpm workspace package, so this is a
// deliberate copy. It MUST stay behaviourally identical to
// @huddle/core's notifications; packages/core/tests/notifications.test.ts
// imports both and runs them through the same inputs to catch drift.
// Edit both files together.
// =====================================================================

export type NotificationEvent = 'new_idea' | 'picker_ran' | 'group_invite' | 'new_comment';

export interface NotificationPrefs {
  new_idea: boolean;
  picker_ran: boolean;
  group_invite: boolean;
  new_comment: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  new_idea: true,
  picker_ran: true,
  group_invite: true,
  new_comment: true,
};

export function shouldNotify(
  prefs: NotificationPrefs | null | undefined,
  event: NotificationEvent,
): boolean {
  return (prefs ?? DEFAULT_PREFS)[event];
}

export interface Recipient {
  userId: string;
  expoToken: string;
  prefs: NotificationPrefs | null;
}

export function selectRecipientTokens(
  recipients: Recipient[],
  event: NotificationEvent,
  actorId: string | null,
): string[] {
  return recipients
    .filter((r) => r.userId !== actorId && shouldNotify(r.prefs, event))
    .map((r) => r.expoToken);
}

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
  data?: Record<string, unknown>;
}

export function buildExpoMessages(tokens: string[], content: NotificationContent): ExpoMessage[] {
  return tokens.map((to) => ({
    to,
    title: content.title,
    body: content.body,
    sound: 'default',
    ...(content.data ? { data: content.data } : {}),
  }));
}

export const EXPO_PUSH_CHUNK_SIZE = 100;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk: size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

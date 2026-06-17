import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Push-notification data layer (Phase 8) — framework-free; hooks live in
 * ./push-hooks. Mobile-only in v1 (web gets no push). Covers device-token
 * registration and per-user notification preferences. The actual fan-out
 * is the send-push Edge Function reading these tables as service_role.
 */

type NotificationPrefsRow = Database['public']['Tables']['notification_prefs']['Row'];
type PushPlatform = Database['public']['Enums']['push_platform'];

/** Editable preference fields (mirrors @huddle/core NotificationPrefs). */
export interface NotificationPrefsInput {
  new_idea: boolean;
  picker_ran: boolean;
  group_invite: boolean;
}

export const notificationQueryKeys = {
  prefs: (userId: string) => ['notification-prefs', userId] as const,
};

// -----------------------------------------------------------------------
// Device tokens
// -----------------------------------------------------------------------

/**
 * Register (or refresh) the current user's Expo push token for a device.
 * Idempotent: a repeat of the same (user, token) just advances
 * last_seen_at (the unique constraint drives the upsert).
 */
export async function registerPushToken(
  client: HuddleClient,
  params: { expoToken: string; platform: PushPlatform },
): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_token: params.expoToken,
      platform: params.platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_token' },
  );
  if (error) throwMapped(error);
}

/** Remove a device token (sign-out, or the user disabling notifications). */
export async function removePushToken(
  client: HuddleClient,
  expoToken: string,
): Promise<void> {
  const { error } = await client
    .from('push_tokens')
    .delete()
    .eq('expo_token', expoToken);
  if (error) throwMapped(error);
}

// -----------------------------------------------------------------------
// Preferences
// -----------------------------------------------------------------------

/** The current prefs row, or null if the user has never changed defaults. */
export async function fetchNotificationPrefs(
  client: HuddleClient,
  userId: string,
): Promise<NotificationPrefsRow | null> {
  const { data, error } = await client
    .from('notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwMapped(error);
  return data ?? null;
}

/** Create or update the current user's prefs row. */
export async function upsertNotificationPrefs(
  client: HuddleClient,
  prefs: NotificationPrefsInput,
): Promise<NotificationPrefsRow> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('notification_prefs')
    .upsert(
      { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throwMapped(error);
  return data!;
}

export type { NotificationPrefsRow };

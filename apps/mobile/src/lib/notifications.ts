import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken, removePushToken } from '@huddle/api-client/push-hooks';
import { supabase } from './supabase';

/**
 * Push notification setup (Phase 8) — mobile only. Web gets no push in
 * v1 (and expo-notifications can't mint a token there), so every entry
 * point is a no-op on web (lesson 3: native-only modules need web
 * guards). Token registration/removal go through the shared data layer
 * (@huddle/api-client/push-hooks → push_tokens).
 */

/** Foreground behaviour: show the banner + list, play a sound, no badge. */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** The Expo token most recently registered, so we can remove it on sign-out. */
let registeredToken: string | null = null;

function resolveProjectId(): string | undefined {
  const fromExpo = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  return (fromExpo ?? fromEas) as string | undefined;
}

/**
 * Ask for permission (if needed), mint an Expo push token, and register
 * it for the signed-in user. Safe to call repeatedly — registration is
 * idempotent. No-ops on web, on a non-device (simulators can't get a
 * token), if permission is denied, or if no EAS projectId is available
 * (e.g. plain Expo Go) — all of which are expected in local dev.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let token: string;
  try {
    const projectId = resolveProjectId();
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (e) {
    // No projectId / not a real build — nothing to register. Expected
    // in Expo Go and the web preview; not an error worth surfacing.
    console.warn('[push] could not obtain Expo token', e);
    return;
  }

  registeredToken = token;
  try {
    await registerPushToken(supabase, {
      expoToken: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  } catch (e) {
    console.warn('[push] backend token registration failed', e);
  }
}

/** Remove the registered token (call before sign-out). */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS === 'web' || !registeredToken) return;
  try {
    await removePushToken(supabase, registeredToken);
  } catch (e) {
    console.warn('[push] token removal failed', e);
  }
  registeredToken = null;
}

/** Read a deep-link path out of a notification's data payload, if any. */
export function pathFromResponse(
  response: Notifications.NotificationResponse | null,
): string | null {
  const path = response?.notification.request.content.data?.path;
  return typeof path === 'string' ? path : null;
}

/**
 * Subscribe to taps on delivered notifications. Returns an unsubscribe.
 * No-op on web.
 */
export function addNotificationResponseListener(
  onPath: (path: string) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const path = pathFromResponse(response);
    if (path) onPath(path);
  });
  return () => sub.remove();
}

/** The response that launched the app from a cold start (or null). */
export async function getInitialNotificationPath(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  return pathFromResponse(response);
}

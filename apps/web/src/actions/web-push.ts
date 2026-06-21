'use server';

import {
  saveWebPushSubscription,
  removeWebPushSubscription,
  type WebPushSubscriptionInput,
} from '@huddle/api-client/push';
import { getSupabaseServerClient } from '@/lib/supabase';

/**
 * Store the caller's browser push subscription (Phase 15). The client
 * subscribes via the Push API, then hands us the serializable
 * {endpoint, keys} to persist for the send-push fan-out.
 */
export async function saveWebPushSubscriptionAction(
  sub: WebPushSubscriptionInput,
): Promise<{ ok: boolean }> {
  const supabase = await getSupabaseServerClient();
  try {
    await saveWebPushSubscription(supabase, sub);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Forget a browser subscription (the user turning web notifications off). */
export async function removeWebPushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await getSupabaseServerClient();
  try {
    await removeWebPushSubscription(supabase, endpoint);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

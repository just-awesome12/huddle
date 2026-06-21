'use server';

import { revalidatePath } from 'next/cache';
import { setGroupMute } from '@huddle/api-client/push';
import { getSupabaseServerClient } from '@/lib/supabase';

/** Mute / unmute push notifications for a group, for the current user (15b). */
export async function setGroupMuteAction(
  groupId: string,
  muted: boolean,
): Promise<{ ok: boolean }> {
  const supabase = await getSupabaseServerClient();
  try {
    await setGroupMute(supabase, groupId, muted);
  } catch {
    return { ok: false };
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

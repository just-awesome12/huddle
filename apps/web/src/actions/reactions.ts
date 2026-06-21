'use server';

import { revalidatePath } from 'next/cache';
import { reactionEmojiSchema, reactionTargetSchema } from '@huddle/validation';
import { toggleReaction } from '@huddle/api-client/reactions';
import { getSupabaseServerClient } from '@/lib/supabase';

/** Toggle the caller's emoji reaction on a target (plain action). */
export async function toggleReactionAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const targetType = reactionTargetSchema.safeParse(formData.get('targetType'));
  const emoji = reactionEmojiSchema.safeParse(formData.get('emoji'));
  const reacted = String(formData.get('reacted') ?? '') === 'true';
  const path = String(formData.get('path') ?? '');
  if (!groupId || !targetId || !targetType.success || !emoji.success) return;

  const supabase = await getSupabaseServerClient();
  try {
    await toggleReaction(
      supabase,
      { groupId, targetType: targetType.data, targetId, emoji: emoji.data },
      reacted,
    );
  } catch {
    // RLS / unique race — the recomputed page reflects the truth.
  }
  // Revalidate the page the bar lives on (idea detail or history).
  revalidatePath(path.startsWith('/groups/') ? path : `/groups/${groupId}`);
}

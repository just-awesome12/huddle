import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { throwMapped, requireUserId } from './internal';

/**
 * Emoji reactions on ideas / decisions / comments — framework-free.
 * Polymorphic (target_type + target_id). Hook wrappers in ./reactions-hooks.
 */

type HuddleClient = SupabaseClient<Database>;

export type ReactionTargetType = Database['public']['Enums']['reaction_target'];

/** The allowed reaction set (mirrors the DB CHECK + @huddle/validation). */
export const REACTION_EMOJIS = ['👍', '🎉', '🔥', '😂', '😮', '🙌'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the current user contributed this emoji. */
  mine: boolean;
}

export const reactionQueryKeys = {
  group: (groupId: string) => ['groups', groupId, 'reactions'] as const,
};

/** Stable key for a reaction target. */
export function reactionTargetKey(type: ReactionTargetType, id: string): string {
  return `${type}:${id}`;
}

/**
 * All reactions in a group, aggregated per target into ordered emoji
 * summaries (count + whether the caller reacted). Keyed by
 * `${target_type}:${target_id}`.
 */
export async function fetchGroupReactions(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<Record<string, ReactionSummary[]>> {
  const { data, error } = await client
    .from('reactions')
    .select('target_type, target_id, emoji, user_id')
    .eq('group_id', groupId);

  if (error) throwMapped(error);

  const acc: Record<string, Map<string, { count: number; mine: boolean }>> = {};
  for (const r of data ?? []) {
    const key = reactionTargetKey(r.target_type, r.target_id);
    const byEmoji = (acc[key] ??= new Map());
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === userId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }

  const order = (e: string) => {
    const i = (REACTION_EMOJIS as readonly string[]).indexOf(e);
    return i === -1 ? REACTION_EMOJIS.length : i;
  };

  const out: Record<string, ReactionSummary[]> = {};
  for (const [key, byEmoji] of Object.entries(acc)) {
    out[key] = [...byEmoji.entries()]
      .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
      .sort((a, b) => order(a.emoji) - order(b.emoji));
  }
  return out;
}

export interface ToggleReactionParams {
  groupId: string;
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
}

/** Add (or, if `reacted`, remove) the caller's emoji on a target. */
export async function toggleReaction(
  client: HuddleClient,
  params: ToggleReactionParams,
  reacted: boolean,
): Promise<void> {
  const userId = await requireUserId(client);
  if (reacted) {
    const { error } = await client
      .from('reactions')
      .delete()
      .eq('target_type', params.targetType)
      .eq('target_id', params.targetId)
      .eq('user_id', userId)
      .eq('emoji', params.emoji);
    if (error) throwMapped(error);
  } else {
    const { error } = await client.from('reactions').insert({
      group_id: params.groupId,
      target_type: params.targetType,
      target_id: params.targetId,
      user_id: userId,
      emoji: params.emoji,
    });
    if (error) throwMapped(error);
  }
}

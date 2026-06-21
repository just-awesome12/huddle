import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import {
  useToggleReaction,
  REACTION_EMOJIS,
  type ReactionSummary,
  type ReactionTargetType,
} from '@huddle/api-client/reactions-hooks';
import { supabase } from '@/lib/supabase';

/** A row of toggle-able emoji reactions for one target. */
export function ReactionBar({
  groupId,
  targetType,
  targetId,
  summaries,
}: {
  groupId: string;
  targetType: ReactionTargetType;
  targetId: string;
  summaries: ReactionSummary[];
}) {
  const c = useColors();
  const styles = makeStyles(c);
  const toggle = useToggleReaction(supabase);
  const byEmoji = new Map(summaries.map((s) => [s.emoji, s]));

  return (
    <View style={styles.row}>
      {REACTION_EMOJIS.map((emoji) => {
        const s = byEmoji.get(emoji);
        const mine = s?.mine ?? false;
        const count = s?.count ?? 0;
        return (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            disabled={toggle.isPending}
            onPress={() =>
              toggle.mutate({ params: { groupId, targetType, targetId, emoji }, reacted: mine })
            }
            style={[styles.chip, mine && styles.chipOn]}
          >
            <Text style={[styles.chipText, mine && styles.chipTextOn]}>
              {emoji}
              {count > 0 ? ` ${count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipOn: { borderColor: c.accent[400], backgroundColor: c.accent[50] },
    chipText: { fontSize: 13, fontWeight: '700', color: c.muted },
    chipTextOn: { color: c.accent[600] },
  });

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroupIdeas } from '@huddle/api-client/ideas-hooks';
import { useRunPicker } from '@huddle/api-client/decisions-hooks';
import type { IdeaCategory } from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const s = makeChipStyles(c);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.chip, active && s.active]}>
      <Text style={[s.label, active && s.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

export default function PickScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const ideas = useGroupIdeas(supabase, id, { status: 'on_radar' });
  const runPicker = useRunPicker(supabase);
  const result = runPicker.data;

  const [category, setCategory] = useState<IdeaCategory | undefined>(undefined);
  const [useShortlist, setUseShortlist] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rollTitle, setRollTitle] = useState<string | null>(null);

  const candidates = (ideas.data ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    category: i.category,
  }));
  const visible = candidates.filter((x) => !category || x.category === category);
  const shortlistCount = visible.filter((x) => picked.has(x.id)).length;
  const shortlistInvalid = useShortlist && shortlistCount === 0;

  // Drumroll while a pick is in flight.
  useEffect(() => {
    if (!runPicker.isPending) {
      setRollTitle(null);
      return;
    }
    const pool = useShortlist ? visible.filter((x) => picked.has(x.id)) : visible;
    if (pool.length === 0) return;
    let i = Math.floor(Math.random() * pool.length);
    setRollTitle(pool[i]!.title);
    const interval = setInterval(() => {
      i = (i + 1) % pool.length;
      setRollTitle(pool[i]!.title);
    }, 90);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPicker.isPending]);

  // Fade the winner in on reveal.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (result?.outcome === 'picked') {
      reveal.setValue(0);
      Animated.timing(reveal, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
  }, [result, reveal]);

  const toggle = (ideaId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ideaId)) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });
  };

  const onPick = () => {
    runPicker.mutate({
      groupId: id,
      category,
      shortlist: useShortlist ? [...picked] : undefined,
    });
  };

  const chosen = result?.outcome === 'picked' ? result.decision.chosen : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.heading}>Pick for us</Text>
        <Button
          label="History"
          variant="ghost"
          onPress={() => router.push(`/groups/${id}/history`)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Reveal / status card */}
        <View style={styles.card}>
          {runPicker.isPending ? (
            <>
              <Text style={styles.emoji}>🎲</Text>
              <Text style={styles.rolling}>{rollTitle ?? 'Shuffling…'}</Text>
            </>
          ) : chosen ? (
            <Animated.View style={{ opacity: reveal, alignItems: 'center' }}>
              <Text style={styles.emoji}>🎉</Text>
              <Text style={styles.kicker}>The pick is</Text>
              <Text style={styles.winner}>{chosen.title}</Text>
              <View style={styles.winnerBadge}>
                <CategoryBadge category={chosen.category} />
              </View>
              <Button
                label="Open this idea →"
                variant="ghost"
                onPress={() => router.push(`/groups/${id}/ideas/${chosen.id}`)}
              />
            </Animated.View>
          ) : result?.outcome === 'no_candidates' ? (
            <Text style={styles.muted}>
              Nothing on the radar matched those options. Add an idea or widen the filter.
            </Text>
          ) : runPicker.isError ? (
            <Text style={styles.error}>The picker failed. Please try again.</Text>
          ) : (
            <Text style={styles.muted}>Can&apos;t agree? Let Huddle pick one for you.</Text>
          )}
        </View>

        {candidates.length === 0 && !ideas.isPending ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing on the radar yet</Text>
            <Text style={styles.muted}>Add an idea first, then come back.</Text>
            <Button label="Add an idea" onPress={() => router.push(`/groups/${id}/ideas/new`)} />
          </View>
        ) : (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipsRow}>
              <Chip
                label="Any category"
                active={!category}
                onPress={() => setCategory(undefined)}
              />
              {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((value) => (
                <Chip
                  key={value}
                  label={CATEGORY_LABELS[value]}
                  active={category === value}
                  onPress={() => setCategory(value)}
                />
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: useShortlist }}
              style={styles.shortlistToggle}
              onPress={() => setUseShortlist((v) => !v)}
            >
              <View style={[styles.checkbox, useShortlist && styles.checkboxOn]}>
                {useShortlist ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.shortlistLabel}>Only pick from a shortlist</Text>
            </Pressable>

            {useShortlist ? (
              <View style={styles.shortlist}>
                {visible.length === 0 ? (
                  <Text style={styles.muted}>No ideas in this category to shortlist.</Text>
                ) : (
                  visible.map((x) => (
                    <Pressable
                      key={x.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked.has(x.id) }}
                      style={styles.shortlistRow}
                      onPress={() => toggle(x.id)}
                    >
                      <View style={[styles.checkbox, picked.has(x.id) && styles.checkboxOn]}>
                        {picked.has(x.id) ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <Text style={styles.shortlistItem} numberOfLines={1}>
                        {x.title}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            {shortlistInvalid ? (
              <Text style={styles.warn}>Select at least one idea, or turn off the shortlist.</Text>
            ) : null}

            <View style={styles.pickButton}>
              <Button
                label="Pick for us"
                loading={runPicker.isPending}
                disabled={shortlistInvalid}
                onPress={onPick}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeChipStyles = (c: ThemeColors) =>
  StyleSheet.create({
    chip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: c.surface2,
    },
    active: { backgroundColor: c.brand[600] },
    label: { fontSize: 12, fontWeight: '600', color: c.muted },
    activeLabel: { color: c.white },
  });

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    heading: { fontSize: 16, fontWeight: '600', color: c.text },
    body: { padding: 16, gap: 12 },
    card: {
      minHeight: 140,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      paddingHorizontal: 24,
      paddingVertical: 28,
      gap: 4,
    },
    emoji: { fontSize: 30 },
    rolling: { fontSize: 18, fontWeight: '600', color: c.text },
    kicker: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    winner: { marginTop: 2, fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    winnerBadge: { marginTop: 8, marginBottom: 4 },
    muted: { fontSize: 13, color: c.muted, textAlign: 'center' },
    error: { fontSize: 13, color: c.dangerText, textAlign: 'center' },
    warn: { fontSize: 12, color: c.accent[600] },
    label: { fontSize: 14, fontWeight: '600', color: c.text },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    shortlistToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    shortlistLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    shortlist: {
      gap: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 8,
    },
    shortlistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    shortlistItem: { flexShrink: 1, fontSize: 14, color: c.text },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    checkboxOn: { backgroundColor: c.brand[600], borderColor: c.brand[600] },
    checkMark: { color: c.white, fontSize: 13, fontWeight: '700' },
    pickButton: { marginTop: 8 },
    empty: {
      alignItems: 'center',
      gap: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      padding: 24,
    },
    emptyTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  });

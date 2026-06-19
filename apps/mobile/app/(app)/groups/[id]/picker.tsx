import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroup } from '@huddle/api-client/groups-hooks';
import { useGroupIdeas } from '@huddle/api-client/ideas-hooks';
import { useRunPicker, PickerError } from '@huddle/api-client/decisions-hooks';
import type { IdeaCategory } from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

type Phase = 'idle' | 'rolling' | 'done';

const MIN_SPIN_MS = 1400;
const TICK_MS = 90;

function FilterChip({
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
    activeLabel: { color: c.surface },
  });

export default function PickerScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useGroupRealtime(id);

  const group = useGroup(supabase, id);
  const ideasQuery = useGroupIdeas(supabase, id, { status: 'on_radar' });
  const runPicker = useRunPicker(supabase);

  const [category, setCategory] = useState<IdeaCategory | ''>('');
  const [useShortlist, setUseShortlist] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>('idle');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pickCount, setPickCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ideas = useMemo(() => ideasQuery.data ?? [], [ideasQuery.data]);

  // Ideas shown in the list — narrowed only by category (shortlist
  // toggles per-idea below).
  const displayed = useMemo(
    () => (category ? ideas.filter((i) => i.category === category) : ideas),
    [ideas, category],
  );

  // Candidate pool mirrors the server: category, then shortlist if used.
  const candidates = useMemo(() => {
    let pool = displayed;
    if (useShortlist && selected.size > 0) {
      pool = pool.filter((i) => selected.has(i.id));
    }
    return pool;
  }, [displayed, useShortlist, selected]);

  const canPick = candidates.length >= 2 && phase !== 'rolling';
  const chosen = chosenId ? (ideas.find((i) => i.id === chosenId) ?? null) : null;

  const toggleSelected = (ideaId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ideaId)) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });
  };

  const handlePick = async () => {
    if (!canPick) return;
    setError(null);
    setChosenId(null);
    setPhase('rolling');

    const pool = candidates;
    let i = 0;
    setHighlightId(pool[0]?.id ?? null);
    tickRef.current = setInterval(() => {
      i = (i + 1) % pool.length;
      setHighlightId(pool[i]?.id ?? null);
    }, TICK_MS);

    const start = Date.now();
    try {
      const res = await runPicker.mutateAsync({
        groupId: id,
        category: category || undefined,
        shortlist: useShortlist && selected.size > 0 ? [...selected] : undefined,
      });
      const elapsed = Date.now() - start;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      if (tickRef.current) clearInterval(tickRef.current);
      setHighlightId(res.chosenIdeaId);
      setChosenId(res.chosenIdeaId);
      setPickCount(pool.length);
      setPhase('done');
    } catch (e) {
      if (tickRef.current) clearInterval(tickRef.current);
      setPhase('idle');
      setHighlightId(null);
      if (e instanceof PickerError) {
        setError(
          e.code === 'too_few_candidates'
            ? 'Need at least 2 ideas to pick from. Clear a filter or add more ideas.'
            : e.code === 'forbidden'
              ? "You're not a member of this group."
              : 'Could not run the picker. Please try again.',
        );
      } else {
        setError('Could not run the picker. Please try again.');
      }
    }
  };

  if (group.isPending || ideasQuery.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
      </View>
    );
  }

  if (group.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Group not found</Text>
        <Button
          label="Back to groups"
          variant="secondary"
          onPress={() => router.replace('/groups')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.replace(`/groups/${id}`)} />
        <Button
          label="History"
          variant="ghost"
          onPress={() => router.push(`/groups/${id}/history`)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Random picker</Text>
        <Text style={styles.subtitle}>
          Can&rsquo;t agree? Let Huddle choose from your on-the-radar ideas.
        </Text>

        {ideas.length < 2 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Not enough ideas yet</Text>
            <Text style={styles.mutedText}>
              Add at least two on-the-radar ideas, then come back to let Huddle choose.
            </Text>
            <Button label="Add an idea" onPress={() => router.push(`/groups/${id}/ideas/new`)} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipsRow}>
              <FilterChip label="Any" active={category === ''} onPress={() => setCategory('')} />
              {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((cat) => (
                <FilterChip
                  key={cat}
                  label={CATEGORY_LABELS[cat]}
                  active={category === cat}
                  onPress={() => setCategory(cat)}
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
                {useShortlist ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.shortlistLabel}>Choose from a shortlist</Text>
            </Pressable>
            {useShortlist ? (
              <Text style={styles.mutedText}>
                Tap ideas to include. Leave all untapped to use every idea in the category.
              </Text>
            ) : null}

            <View style={styles.candidateList}>
              {displayed.map((idea) => {
                const inPool = candidates.some((p) => p.id === idea.id);
                const isHighlight = highlightId === idea.id;
                const isChosen = phase === 'done' && chosenId === idea.id;
                const isSelected = selected.has(idea.id);
                return (
                  <Pressable
                    key={idea.id}
                    disabled={!useShortlist}
                    onPress={() => toggleSelected(idea.id)}
                    style={[
                      styles.candidate,
                      isHighlight && styles.candidateHighlight,
                      isChosen && styles.candidateChosen,
                      !inPool && styles.candidateDim,
                    ]}
                  >
                    <View style={styles.candidateLeft}>
                      {useShortlist ? (
                        <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                          {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                        </View>
                      ) : null}
                      <Text style={styles.candidateTitle} numberOfLines={1}>
                        {idea.title}
                      </Text>
                    </View>
                    <CategoryBadge category={idea.category} />
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <View style={styles.alert}>
                <Text style={styles.alertText} accessibilityRole="alert">
                  {error}
                </Text>
              </View>
            ) : null}

            {phase === 'done' ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>The pick is</Text>
                <Text style={styles.resultTitle}>{chosen ? chosen.title : 'an idea'}</Text>
                {pickCount !== null ? (
                  <Text style={styles.resultProvenance}>
                    Chosen at random from {pickCount} option{pickCount === 1 ? '' : 's'}
                  </Text>
                ) : null}
                {chosen ? (
                  <Button
                    label="View idea"
                    variant="secondary"
                    onPress={() => router.push(`/groups/${id}/ideas/${chosen.id}`)}
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              label={phase === 'done' ? 'Pick again' : 'Pick for us'}
              loading={phase === 'rolling'}
              disabled={!canPick}
              onPress={handlePick}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: c.canvas,
    },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    scroll: { padding: 16, gap: 12 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    subtitle: { fontSize: 13, color: c.muted },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    sectionTitle: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    shortlistToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    shortlistLabel: { fontSize: 14, fontWeight: '600', color: c.text },
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
    checkmark: { color: c.surface, fontSize: 13, fontWeight: '700' },
    candidateList: { gap: 8, marginTop: 4 },
    candidate: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    candidateHighlight: { borderColor: c.brand[400], backgroundColor: c.surface2 },
    candidateChosen: { borderColor: c.brand[600], backgroundColor: c.brandBg },
    candidateDim: { opacity: 0.4 },
    candidateLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    candidateTitle: { fontSize: 14, fontWeight: '600', color: c.text, flexShrink: 1 },
    mutedText: { fontSize: 13, color: c.muted },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    resultCard: {
      borderWidth: 1,
      borderColor: c.brand[600],
      backgroundColor: c.brandBg,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    resultLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.brandInk,
    },
    resultTitle: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
    resultProvenance: { fontSize: 12, color: c.muted, textAlign: 'center' },
    emptyCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  });

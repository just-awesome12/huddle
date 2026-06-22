import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroup } from '@huddle/api-client/groups-hooks';
import { useGroupIdeas } from '@huddle/api-client/ideas-hooks';
import { useRunPicker, PickerError } from '@huddle/api-client/decisions-hooks';
import {
  useGroupCandidateSets,
  useCreateCandidateSet,
  useDeleteCandidateSet,
  type CandidateSetRow,
} from '@huddle/api-client/candidate-sets-hooks';
import {
  candidateSetNameSchema,
  candidateSetIdeaIdsSchema,
  type IdeaCategory,
} from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
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

  const { session } = useAuth();
  const myUserId = session?.user.id;

  const group = useGroup(supabase, id);
  const ideasQuery = useGroupIdeas(supabase, id, { status: 'on_radar' });
  const doneQuery = useGroupIdeas(supabase, id, { status: 'done' });
  const runPicker = useRunPicker(supabase);
  const setsQuery = useGroupCandidateSets(supabase, id);
  const createSet = useCreateCandidateSet(supabase, id);
  const deleteSet = useDeleteCandidateSet(supabase, id);

  const [category, setCategory] = useState<IdeaCategory | ''>('');
  const [useShortlist, setUseShortlist] = useState(false);
  const [fair, setFair] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [setName, setSetName] = useState('');
  const [saveSetError, setSaveSetError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pickCount, setPickCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Celebratory pop on the reveal (the mobile take on "confetti").
  const popAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase === 'done') {
      popAnim.setValue(0);
      Animated.spring(popAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    }
  }, [phase, popAnim]);

  const ideas = useMemo(() => ideasQuery.data ?? [], [ideasQuery.data]);
  const doneIdeas = useMemo(() => doneQuery.data ?? [], [doneQuery.data]);

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

  // "Just decide" fallback (15c): widen an unfiltered, too-small pool with
  // past picks (done ideas) so the picker still works.
  const noFilter = !category && !(useShortlist && selected.size > 0);
  const useFallback = candidates.length < 2 && noFilter && doneIdeas.length > 0;
  const effectivePool = useFallback ? [...candidates, ...doneIdeas] : candidates;
  const listItems = useFallback ? effectivePool : displayed;

  const canPick = effectivePool.length >= 2 && phase !== 'rolling';
  const chosen = chosenId
    ? ([...ideas, ...doneIdeas].find((i) => i.id === chosenId) ?? null)
    : null;

  const toggleSelected = (ideaId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ideaId)) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });
  };

  // Saved sets (15e): load one into the shortlist, or save the current one.
  const savedSets = setsQuery.data ?? [];
  const ideaIdSet = useMemo(() => new Set(ideas.map((i) => i.id)), [ideas]);

  const loadSet = (set: CandidateSetRow) => {
    setCategory('');
    setUseShortlist(true);
    setSelected(new Set(set.idea_ids.filter((x) => ideaIdSet.has(x))));
    setError(null);
  };

  const onSaveSet = () => {
    setSaveSetError(null);
    const name = candidateSetNameSchema.safeParse(setName);
    const ids = candidateSetIdeaIdsSchema.safeParse([...selected]);
    if (!name.success) {
      setSaveSetError(name.error.issues[0]?.message ?? 'Name this set');
      return;
    }
    if (!ids.success) {
      setSaveSetError(ids.error.issues[0]?.message ?? 'Pick at least 2 ideas');
      return;
    }
    createSet.mutate({ name: name.data, ideaIds: ids.data }, { onSuccess: () => setSetName('') });
  };

  const handlePick = async () => {
    if (!canPick) return;
    setError(null);
    setChosenId(null);
    setPhase('rolling');

    const pool = effectivePool;
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
        fair,
        fallback: useFallback,
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

        {ideas.length + doneIdeas.length < 2 ? (
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

            {savedSets.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Saved sets</Text>
                <View style={styles.chipsRow}>
                  {savedSets.map((set) => (
                    <View key={set.id} style={styles.setChip}>
                      <Pressable onPress={() => loadSet(set)}>
                        <Text style={styles.setChipLabel}>▶ {set.name}</Text>
                      </Pressable>
                      {myUserId && set.created_by === myUserId ? (
                        <Pressable
                          onPress={() => deleteSet.mutate(set.id)}
                          accessibilityLabel={`Delete set ${set.name}`}
                          hitSlop={8}
                        >
                          <Text style={styles.setChipDelete}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

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

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: fair }}
              style={styles.shortlistToggle}
              onPress={() => setFair((v) => !v)}
            >
              <View style={[styles.checkbox, fair && styles.checkboxOn]}>
                {fair ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.shortlistLabel}>Give everyone a fair shot</Text>
            </Pressable>
            {fair ? (
              <Text style={styles.mutedText}>
                Leans toward people whose ideas haven’t been picked yet. Still random — just
                weighted.
              </Text>
            ) : null}

            {useFallback ? (
              <Text style={styles.mutedText}>
                Not enough new ideas — including past picks so you can still decide.
              </Text>
            ) : null}

            <View style={styles.candidateList}>
              {listItems.map((idea) => {
                const inPool = effectivePool.some((p) => p.id === idea.id);
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

            {/* Save the current shortlist as a reusable set (15e). */}
            {useShortlist && selected.size >= 2 ? (
              <View style={styles.saveSetRow}>
                <TextInput
                  value={setName}
                  onChangeText={setSetName}
                  placeholder="Name this set (e.g. Friday dinner)"
                  placeholderTextColor={c.faint}
                  maxLength={60}
                  style={styles.saveSetInput}
                />
                <Button
                  label="Save set"
                  variant="secondary"
                  onPress={onSaveSet}
                  loading={createSet.isPending}
                  disabled={setName.trim().length === 0}
                />
              </View>
            ) : null}
            {saveSetError ? <Text style={styles.saveSetError}>{saveSetError}</Text> : null}

            {error ? (
              <View style={styles.alert}>
                <Text style={styles.alertText} accessibilityRole="alert">
                  {error}
                </Text>
              </View>
            ) : null}

            {phase === 'done' ? (
              <View style={styles.resultCard}>
                <Animated.Text style={[styles.celebrate, { transform: [{ scale: popAnim }] }]}>
                  🎉
                </Animated.Text>
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
    setChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.surface2,
    },
    setChipLabel: { fontSize: 13, fontWeight: '600', color: c.text },
    setChipDelete: { fontSize: 16, color: c.faint, fontWeight: '700' },
    saveSetRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
    saveSetInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.surface,
    },
    saveSetError: { fontSize: 12, color: c.danger, marginTop: 4 },
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
    celebrate: { fontSize: 32, textAlign: 'center' },
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

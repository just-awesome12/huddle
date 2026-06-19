import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroup } from '@huddle/api-client/groups-hooks';
import { useGroupDecisions, useGroupFairness } from '@huddle/api-client/decisions-hooks';
import { useGroupIdeas } from '@huddle/api-client/ideas-hooks';
import { useGroupVoteState } from '@huddle/api-client/votes-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';

/** All-time "The story so far" recap, composed from existing reads. */
export default function RecapScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  useGroupRealtime(id);

  const group = useGroup(supabase, id);
  const ideas = useGroupIdeas(supabase, id);
  const decisions = useGroupDecisions(supabase, id);
  const fairness = useGroupFairness(supabase, id);
  const votes = useGroupVoteState(supabase, id, myUserId ?? '');

  if (group.isPending || ideas.isPending || decisions.isPending) {
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
        <Button label="Back" variant="secondary" onPress={() => router.replace('/groups')} />
      </View>
    );
  }

  const ideaList = ideas.data ?? [];
  const doneCount = ideaList.filter((i) => i.status === 'done').length;
  const topProposer = (fairness.data ?? []).find((m) => m.picked > 0) ?? null;

  const countByIdea = votes.data?.countByIdea ?? {};
  let mostLoved: { title: string; count: number } | null = null;
  for (const idea of ideaList) {
    const count = countByIdea[idea.id] ?? 0;
    if (count > 0 && (!mostLoved || count > mostLoved.count)) {
      mostLoved = { title: idea.title, count };
    }
  }

  const stats = [
    { label: 'Ideas proposed', value: String(ideaList.length) },
    { label: 'Picker decided', value: String((decisions.data ?? []).length) },
    { label: 'Ideas done', value: String(doneCount) },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.replace(`/groups/${id}`)} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>The story so far</Text>
        <Text style={styles.subtitle}>{group.data.name} in numbers.</Text>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {topProposer ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Most successful proposer</Text>
            <Text style={styles.cardBody}>
              {topProposer.displayName} — {topProposer.picked}{' '}
              {topProposer.picked === 1 ? 'idea' : 'ideas'} picked
            </Text>
          </View>
        ) : null}

        {mostLoved ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Most loved idea</Text>
            <Text style={styles.cardBody}>
              {mostLoved.title} — ❤ {mostLoved.count}
            </Text>
          </View>
        ) : null}

        {ideaList.length === 0 ? (
          <Text style={styles.subtitle}>
            Nothing to recap yet — add some ideas and run the picker.
          </Text>
        ) : null}
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
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    statCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 16,
    },
    statValue: { fontSize: 24, fontWeight: '700', color: c.brandInk },
    statLabel: { fontSize: 11, color: c.muted, marginTop: 4, textAlign: 'center' },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 16,
      gap: 4,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    cardBody: { fontSize: 14, color: c.text },
  });

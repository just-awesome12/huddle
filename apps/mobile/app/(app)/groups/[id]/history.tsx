import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroup } from '@huddle/api-client/groups-hooks';
import { useGroupDecisions } from '@huddle/api-client/decisions-hooks';
import { supabase } from '@/lib/supabase';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

export default function HistoryScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useGroupRealtime(id);

  const group = useGroup(supabase, id);
  const decisions = useGroupDecisions(supabase, id);

  if (group.isPending || decisions.isPending) {
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
        <Button label="Run picker" onPress={() => router.push(`/groups/${id}/picker`)} />
      </View>

      <FlatList
        data={decisions.data ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.title}>Decision history</Text>}
        ListEmptyComponent={
          decisions.isError ? (
            <Text style={styles.mutedText}>Couldn&apos;t load history.</Text>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No picks yet</Text>
              <Text style={styles.mutedText}>
                When your group runs the picker, the results show up here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const filters = item.filters as { category?: string | null } | null;
          const categoryFilter = filters && typeof filters === 'object' ? filters.category : null;
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>Picked</Text>
                  {item.chosen ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/groups/${id}/ideas/${item.chosen!.id}`)}
                    >
                      <Text style={styles.chosenTitle}>{item.chosen.title}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.removed}>(idea removed)</Text>
                  )}
                </View>
                {item.chosen ? <CategoryBadge category={item.chosen.category} /> : null}
              </View>
              <Text style={styles.meta}>
                by {item.runner?.display_name ?? 'someone'} ·{' '}
                {new Date(item.created_at).toLocaleString()} · randomly from{' '}
                {item.candidate_idea_ids.length} option
                {item.candidate_idea_ids.length === 1 ? '' : 's'}
                {categoryFilter
                  ? ` · ${CATEGORY_LABELS[categoryFilter as keyof typeof CATEGORY_LABELS] ?? categoryFilter} only`
                  : ''}
              </Text>
            </View>
          );
        }}
      />
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
    list: { padding: 16, gap: 12 },
    title: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 4 },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    mutedText: { fontSize: 13, color: c.muted },
    emptyCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    row: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    rowInfo: { flexShrink: 1 },
    rowLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    chosenTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    removed: { fontSize: 14, fontWeight: '600', color: c.faint, fontStyle: 'italic' },
    meta: { fontSize: 12, color: c.muted },
  });

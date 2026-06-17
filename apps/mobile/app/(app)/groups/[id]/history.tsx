import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useGroupDecisions,
  type DecisionWithDetails,
} from '@huddle/api-client/decisions-hooks';
import { supabase } from '@/lib/supabase';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

function filterLabel(decision: DecisionWithDetails): string | null {
  const filters = decision.filters as { category?: string | null } | null;
  const category = filters?.category;
  if (category && category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS];
  }
  return null;
}

export default function HistoryScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useGroupRealtime(id);
  const decisions = useGroupDecisions(supabase, id);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.heading}>History</Text>
        <Button
          label="Pick"
          variant="ghost"
          onPress={() => router.push(`/groups/${id}/pick`)}
        />
      </View>

      {decisions.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand[600]} />
        </View>
      ) : decisions.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn&apos;t load history.</Text>
        </View>
      ) : decisions.data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No picks yet</Text>
          <Text style={styles.muted}>When you run the picker, results show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={decisions.data}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const label = filterLabel(item);
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  {item.chosen ? (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.titleWrap}
                      onPress={() => router.push(`/groups/${id}/ideas/${item.chosen!.id}`)}
                    >
                      <Text style={styles.title} numberOfLines={1}>
                        {item.chosen.title}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.title, styles.removed]} numberOfLines={1}>
                      (idea removed)
                    </Text>
                  )}
                  {item.chosen ? <CategoryBadge category={item.chosen.category} /> : null}
                </View>
                <Text style={styles.meta}>
                  picked by {item.runner?.display_name ?? 'someone'} ·{' '}
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                <Text style={styles.sub}>
                  from {item.candidate_idea_ids.length} candidate
                  {item.candidate_idea_ids.length === 1 ? '' : 's'}
                  {label ? ` · ${label} only` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
    list: { padding: 16, gap: 8 },
    row: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 2,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    titleWrap: { flexShrink: 1 },
    title: { fontSize: 14, fontWeight: '600', color: c.text },
    removed: { color: c.faint, fontStyle: 'italic' },
    meta: { fontSize: 12, color: c.muted },
    sub: { fontSize: 11, color: c.faint },
    muted: { fontSize: 13, color: c.muted, textAlign: 'center' },
    emptyTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  });

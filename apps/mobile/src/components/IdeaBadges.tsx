import { StyleSheet, Text, View } from 'react-native';
import type { IdeaCategory, IdeaStatus } from '@huddle/validation';

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  food: 'Food',
  activity: 'Activity',
  place: 'Place',
  event: 'Event',
  other: 'Other',
};

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  on_radar: 'On the radar',
  done: 'Done',
  dismissed: 'Dismissed',
};

export function CategoryBadge({ category }: { category: IdeaCategory }) {
  return (
    <View style={[styles.badge, styles.category]} testID={`category-badge-${category}`}>
      <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category]}</Text>
    </View>
  );
}

const statusStyles: Record<IdeaStatus, { bg: string; fg: string }> = {
  on_radar: { bg: '#e0f2fe', fg: '#075985' },
  done: { bg: '#dcfce7', fg: '#166534' },
  dismissed: { bg: '#f1f5f9', fg: '#64748b' },
};

export function StatusBadge({ status }: { status: IdeaStatus }) {
  const palette = statusStyles[status];
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg }]}
      testID={`status-badge-${status}`}
    >
      <Text style={[styles.label, { color: palette.fg }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  category: { backgroundColor: '#fffbeb' },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: '#92400e' },
  label: { fontSize: 11, fontWeight: '600' },
});

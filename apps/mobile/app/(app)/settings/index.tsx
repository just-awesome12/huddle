import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';

const ROWS: { href: string; title: string; subtitle: string }[] = [
  {
    href: '/settings/notifications',
    title: 'Notifications',
    subtitle: 'Choose which pushes you receive',
  },
  {
    href: '/settings/blocked',
    title: 'Blocked users',
    subtitle: 'Manage who you’ve blocked',
  },
  { href: '/settings/account', title: 'Account', subtitle: 'Delete your account' },
];

export default function SettingsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.replace('/groups')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.card}>
          {ROWS.map((r, i) => (
            <Pressable
              key={r.href}
              accessibilityRole="button"
              onPress={() => router.push(r.href as never)}
              style={({ pressed }) => [
                styles.row,
                i < ROWS.length - 1 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowSubtitle}>{r.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
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
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowPressed: { backgroundColor: c.surface2 },
    rowText: { flexShrink: 1, gap: 2 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    rowSubtitle: { fontSize: 12, color: c.muted },
    chevron: { fontSize: 20, color: c.faint },
  });

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '@huddle/api-client/push-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';

type PrefKey = 'new_idea' | 'picker_ran' | 'group_invite';

const ROWS: { key: PrefKey; title: string; subtitle: string }[] = [
  { key: 'new_idea', title: 'New ideas', subtitle: 'When someone adds an idea to a group you’re in' },
  { key: 'picker_ran', title: 'Picker results', subtitle: 'When the random picker chooses for your group' },
  { key: 'group_invite', title: 'Group invites', subtitle: 'When someone invites you to a group' },
];

export default function NotificationSettingsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const prefsQuery = useNotificationPrefs(supabase, userId ?? '', { enabled: !!userId });
  const update = useUpdateNotificationPrefs(supabase, userId ?? '');

  // Absent row = everything on (matches send-push's default).
  const row = prefsQuery.data;
  const effective: Record<PrefKey, boolean> = {
    new_idea: row?.new_idea ?? true,
    picker_ran: row?.picker_ran ?? true,
    group_invite: row?.group_invite ?? true,
  };

  const toggle = (key: PrefKey) => {
    update.mutate({ ...effective, [key]: !effective[key] });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Choose which push notifications this account receives.
        </Text>

        {prefsQuery.isPending ? (
          <ActivityIndicator color={c.brand[600]} style={styles.loader} />
        ) : (
          <View style={styles.card}>
            {ROWS.map((r, i) => (
              <View
                key={r.key}
                style={[styles.row, i < ROWS.length - 1 && styles.rowDivider]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowSubtitle}>{r.subtitle}</Text>
                </View>
                <Switch
                  value={effective[r.key]}
                  onValueChange={() => toggle(r.key)}
                  disabled={update.isPending}
                  trackColor={{ false: c.surface2, true: c.brand[600] }}
                  thumbColor={c.surface}
                  accessibilityLabel={r.title}
                />
              </View>
            ))}
          </View>
        )}

        {update.isError ? (
          <View style={styles.alert}>
            <Text style={styles.alertText} accessibilityRole="alert">
              Couldn’t save that change. Please try again.
            </Text>
          </View>
        ) : null}
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
    subtitle: { fontSize: 13, color: c.muted },
    loader: { marginTop: 24 },
    card: {
      marginTop: 4,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowText: { flexShrink: 1, gap: 2 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    rowSubtitle: { fontSize: 12, color: c.muted },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
  });

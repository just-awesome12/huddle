import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useBlockedProfiles, useUnblockUser } from '@huddle/api-client/moderation-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';

export default function BlockedUsersScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const blocked = useBlockedProfiles(supabase, userId, { enabled: !!userId });
  const unblock = useUnblockUser(supabase, userId);

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
      </View>
      <FlatList
        data={blocked.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.title}>Blocked users</Text>}
        ListEmptyComponent={
          blocked.isPending ? (
            <ActivityIndicator color={c.brand[600]} style={styles.loader} />
          ) : (
            <Text style={styles.mutedText}>You haven&rsquo;t blocked anyone.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.username}>@{item.username}</Text>
            </View>
            <Button
              label="Unblock"
              variant="secondary"
              loading={unblock.isPending && unblock.variables === item.id}
              onPress={() => unblock.mutate(item.id)}
            />
          </View>
        )}
      />
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
    list: { padding: 16, gap: 12 },
    title: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 4 },
    loader: { marginTop: 24 },
    mutedText: { fontSize: 13, color: c.muted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    info: { flexShrink: 1 },
    name: { fontSize: 14, fontWeight: '600', color: c.text },
    username: { fontSize: 12, color: c.muted },
  });

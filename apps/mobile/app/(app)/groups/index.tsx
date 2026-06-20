import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useMyGroups } from '@huddle/api-client/groups-hooks';
import {
  useMyPendingInvites,
  usePeekInvite,
  type PendingInvite,
} from '@huddle/api-client/invites-hooks';
import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/notifications';
import { Button } from '@/components/Button';
import { RoleBadge } from '@/components/RoleBadge';
import { ConnectionDot } from '@/components/ConnectionDot';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

/** One pending invite card. Group name comes from peek_invite — RLS
 *  hides the groups table from non-members. */
function PendingInviteCard({ invite }: { invite: PendingInvite }) {
  const router = useRouter();
  const c = useColors();
  const styles = makeStyles(c);
  const peek = usePeekInvite(supabase, invite.token);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.inviteCard, pressed && styles.rowPressed]}
      onPress={() => router.push(`/invites/${invite.token}`)}
    >
      <View>
        <Text style={styles.rowName}>{peek.isSuccess ? peek.data.group_name : 'Group invite'}</Text>
        <Text style={styles.inviteFrom}>
          Invited by {invite.inviter?.display_name ?? 'someone'}
        </Text>
      </View>
      <Text style={styles.viewInvite}>View →</Text>
    </Pressable>
  );
}

export default function GroupListScreen() {
  const router = useRouter();
  const c = useColors();
  const styles = makeStyles(c);
  const { data: groups, isPending, isError, refetch, isRefetching } = useMyGroups(supabase);
  const pendingInvites = useMyPendingInvites(supabase);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Logo />
          <ConnectionDot />
        </View>
        <View style={styles.titleRow}>
          <ThemeToggle />
          <Button
            label="⚙"
            variant="ghost"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
          />
          <Button
            label="Sign out"
            variant="ghost"
            onPress={async () => {
              // Remove this device's push token before the session goes.
              await unregisterPush();
              await supabase.auth.signOut();
            }}
          />
        </View>
      </View>

      {pendingInvites.isSuccess && pendingInvites.data.length > 0 ? (
        <View style={styles.invitesBlock}>
          <Text style={styles.invitesTitle}>Invites for you ({pendingInvites.data.length})</Text>
          {pendingInvites.data.map((invite) => (
            <PendingInviteCard key={invite.id} invite={invite} />
          ))}
        </View>
      ) : null}

      <View style={styles.toolbar}>
        <Text style={styles.heading}>Your groups</Text>
        <View style={styles.toolbarActions}>
          <Button label="Discover" variant="secondary" onPress={() => router.push('/discover')} />
          <Button label="New group" onPress={() => router.push('/groups/new')} />
        </View>
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand[600]} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load your groups.</Text>
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptyText}>
            Create a group to start collecting ideas with your people.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/groups/${item.id}`)}
            >
              <Text style={styles.rowName}>{item.name}</Text>
              <RoleBadge role={item.myRole} />
            </Pressable>
          )}
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    errorText: { fontSize: 14, color: c.dangerText },
    empty: {
      margin: 16,
      padding: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      alignItems: 'center',
      gap: 4,
    },
    emptyTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    emptyText: { fontSize: 13, color: c.muted, textAlign: 'center' },
    list: { padding: 16, gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowPressed: { backgroundColor: c.surface2 },
    rowName: { fontSize: 14, fontWeight: '600', color: c.text },
    invitesBlock: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
    invitesTitle: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    inviteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.canvas,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inviteFrom: { fontSize: 12, color: c.muted },
    viewInvite: { fontSize: 13, fontWeight: '600', color: c.text },
  });

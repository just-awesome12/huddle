import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMyGroups } from '@huddle/api-client/groups-hooks';
import {
  useMyPendingInvites,
  usePeekInvite,
  type PendingInvite,
} from '@huddle/api-client/invites-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { RoleBadge } from '@/components/RoleBadge';
import { ConnectionDot } from '@/components/ConnectionDot';

/** One pending invite card. Group name comes from peek_invite — RLS
 *  hides the groups table from non-members. */
function PendingInviteCard({ invite }: { invite: PendingInvite }) {
  const router = useRouter();
  const peek = usePeekInvite(supabase, invite.token);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.inviteCard, pressed && styles.rowPressed]}
      onPress={() => router.push(`/invites/${invite.token}`)}
    >
      <View>
        <Text style={styles.rowName}>
          {peek.isSuccess ? peek.data.group_name : 'Group invite'}
        </Text>
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
  const { data: groups, isPending, isError, refetch, isRefetching } =
    useMyGroups(supabase);
  const pendingInvites = useMyPendingInvites(supabase);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Huddle</Text>
          <ConnectionDot />
        </View>
        <Button label="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} />
      </View>

      {pendingInvites.isSuccess && pendingInvites.data.length > 0 ? (
        <View style={styles.invitesBlock}>
          <Text style={styles.invitesTitle}>
            Invites for you ({pendingInvites.data.length})
          </Text>
          {pendingInvites.data.map((invite) => (
            <PendingInviteCard key={invite.id} invite={invite} />
          ))}
        </View>
      ) : null}

      <View style={styles.toolbar}>
        <Text style={styles.heading}>Your groups</Text>
        <Button label="New group" onPress={() => router.push('/groups/new')} />
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0f172a" />
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
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, color: '#b91c1c' },
  empty: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#334155' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: { backgroundColor: '#f1f5f9' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  invitesBlock: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  invitesTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inviteFrom: { fontSize: 12, color: '#64748b' },
  viewInvite: { fontSize: 13, fontWeight: '600', color: '#334155' },
});

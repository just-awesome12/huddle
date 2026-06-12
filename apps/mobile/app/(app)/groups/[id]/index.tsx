import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useGroup,
  useGroupMembers,
  useLeaveGroup,
  useRemoveMember,
} from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { groupErrorMessage } from '@/lib/group-errors';
import { Button } from '@/components/Button';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmAction } from '@/components/ConfirmAction';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const leaveGroup = useLeaveGroup(supabase);
  const removeMember = useRemoveMember(supabase);

  if (group.isPending || members.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  // RLS hides groups the user isn't a member of, so forbidden and
  // nonexistent both land here — same "not found" treatment as web.
  if (group.isError || members.isError) {
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

  const myMembership = members.data.find((m) => m.userId === myUserId);
  const isAdmin = myMembership?.role === 'admin';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Groups" variant="ghost" onPress={() => router.replace('/groups')} />
        {isAdmin ? (
          <View style={styles.headerActions}>
            <Button
              label="Invite"
              variant="ghost"
              onPress={() => router.push(`/groups/${id}/invite`)}
            />
            <Button
              label="Settings"
              variant="ghost"
              onPress={() => router.push(`/groups/${id}/settings`)}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.groupName}>{group.data.name}</Text>
        <Text style={styles.sectionTitle}>Members ({members.data.length})</Text>

        <FlatList
          data={members.data}
          keyExtractor={(m) => m.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {item.profile.display_name}
                  {item.userId === myUserId ? (
                    <Text style={styles.you}> (you)</Text>
                  ) : null}
                </Text>
                <Text style={styles.memberUsername}>@{item.profile.username}</Text>
              </View>
              <View style={styles.memberActions}>
                <RoleBadge role={item.role} />
                {isAdmin && item.userId !== myUserId ? (
                  <ConfirmAction
                    buttonLabel="Remove"
                    confirmPrompt={`Remove ${item.profile.display_name} from this group?`}
                    confirmLabel="Remove member"
                    variant="secondary"
                    pending={removeMember.isPending}
                    error={
                      removeMember.isError
                        ? groupErrorMessage(
                            removeMember.error,
                            'Could not remove that member.',
                            'That member is the only admin. Promote someone else first.',
                          )
                        : null
                    }
                    onConfirm={() =>
                      removeMember.mutate({ groupId: id, userId: item.userId })
                    }
                  />
                ) : null}
              </View>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <ConfirmAction
                buttonLabel="Leave group"
                confirmPrompt="Leave this group? You'll need a new invite to rejoin."
                confirmLabel="Leave group"
                variant="secondary"
                pending={leaveGroup.isPending}
                error={
                  leaveGroup.isError
                    ? groupErrorMessage(
                        leaveGroup.error,
                        'Could not leave the group.',
                        "You're the only admin. Promote another member to admin first, or delete the group.",
                      )
                    : null
                }
                onConfirm={() =>
                  leaveGroup.mutate(id, {
                    onSuccess: () => router.replace('/groups'),
                  })
                }
              />
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  headerActions: { flexDirection: 'row', gap: 4 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  groupName: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  sectionTitle: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  list: { paddingVertical: 12, gap: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  memberInfo: { flexShrink: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  you: { color: '#94a3b8', fontWeight: '400' },
  memberUsername: { fontSize: 12, color: '#64748b' },
  memberActions: { alignItems: 'flex-end', gap: 8 },
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
});

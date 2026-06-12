import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { useGroupIdeas, type IdeaFilters } from '@huddle/api-client/ideas-hooks';
import type { IdeaCategory, IdeaStatus } from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { groupErrorMessage } from '@/lib/group-errors';
import { Button } from '@/components/Button';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmAction } from '@/components/ConfirmAction';
import {
  CategoryBadge,
  StatusBadge,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from '@/components/IdeaBadges';

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[chipStyles.chip, active && chipStyles.active]}
    >
      <Text style={[chipStyles.label, active && chipStyles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
  },
  active: { backgroundColor: '#0f172a' },
  label: { fontSize: 12, fontWeight: '600', color: '#475569' },
  activeLabel: { color: '#fff' },
});

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const [filters, setFilters] = useState<IdeaFilters>({});

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const ideas = useGroupIdeas(supabase, id, filters);
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
        <FlatList
          data={members.data}
          keyExtractor={(m) => m.userId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.ideasBlock}>
              <Text style={styles.groupName}>{group.data.name}</Text>

              <View style={styles.ideasHeader}>
                <Text style={styles.sectionTitle}>
                  Ideas{ideas.isSuccess ? ` (${ideas.data.length})` : ''}
                </Text>
                <Button
                  label="New idea"
                  onPress={() => router.push(`/groups/${id}/ideas/new`)}
                />
              </View>

              <View style={styles.chipsRow}>
                <FilterChip
                  label="Any status"
                  active={!filters.status}
                  onPress={() => setFilters((f) => ({ ...f, status: undefined }))}
                />
                {(Object.keys(STATUS_LABELS) as IdeaStatus[]).map((status) => (
                  <FilterChip
                    key={status}
                    label={STATUS_LABELS[status]}
                    active={filters.status === status}
                    onPress={() => setFilters((f) => ({ ...f, status }))}
                  />
                ))}
              </View>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Any category"
                  active={!filters.category}
                  onPress={() => setFilters((f) => ({ ...f, category: undefined }))}
                />
                {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((category) => (
                  <FilterChip
                    key={category}
                    label={CATEGORY_LABELS[category]}
                    active={filters.category === category}
                    onPress={() => setFilters((f) => ({ ...f, category }))}
                  />
                ))}
              </View>

              {ideas.isPending ? (
                <ActivityIndicator color="#0f172a" />
              ) : ideas.isError ? (
                <Text style={styles.mutedText}>Couldn&apos;t load ideas.</Text>
              ) : ideas.data.length === 0 ? (
                <Text style={styles.mutedText}>
                  {filters.status || filters.category
                    ? 'Nothing matches these filters.'
                    : 'No ideas yet. Add the first one!'}
                </Text>
              ) : (
                ideas.data.map((idea) => (
                  <Pressable
                    key={idea.id}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.ideaRow, pressed && styles.ideaRowPressed]}
                    onPress={() => router.push(`/groups/${id}/ideas/${idea.id}`)}
                  >
                    <View style={styles.ideaInfo}>
                      <Text style={styles.ideaTitle} numberOfLines={1}>
                        {idea.title}
                      </Text>
                      <Text style={styles.ideaMeta}>
                        by {idea.proposer?.display_name ?? 'someone'}
                      </Text>
                    </View>
                    <View style={styles.ideaBadges}>
                      <CategoryBadge category={idea.category} />
                      <StatusBadge status={idea.status} />
                    </View>
                  </Pressable>
                ))
              )}

              <Text style={[styles.sectionTitle, styles.membersTitle]}>
                Members ({members.data.length})
              </Text>
            </View>
          }
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
  ideasBlock: { gap: 10 },
  ideasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mutedText: { fontSize: 13, color: '#64748b' },
  ideaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ideaRowPressed: { backgroundColor: '#f1f5f9' },
  ideaInfo: { flexShrink: 1 },
  ideaTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  ideaMeta: { fontSize: 12, color: '#64748b' },
  ideaBadges: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  membersTitle: { marginTop: 20 },
});

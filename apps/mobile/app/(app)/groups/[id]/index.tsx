import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useGroup,
  useGroupMembers,
  useLeaveGroup,
  useRemoveMember,
} from '@huddle/api-client/groups-hooks';
import { useGroupIdeas, type IdeaFilters } from '@huddle/api-client/ideas-hooks';
import { useGroupVoteState } from '@huddle/api-client/votes-hooks';
import { useGroupCommentCounts } from '@huddle/api-client/comments-hooks';
import type { IdeaCategory, IdeaStatus } from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useGroupRealtime } from '@/context/RealtimeContext';
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
  const c = useColors();
  const chipStyles = makeChipStyles(c);
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

const makeChipStyles = (c: ThemeColors) =>
  StyleSheet.create({
    chip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: c.surface2,
    },
    active: { backgroundColor: c.brand[600] },
    label: { fontSize: 12, fontWeight: '600', color: c.muted },
    activeLabel: { color: c.surface },
  });

export default function GroupDetailScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const [filters, setFilters] = useState<IdeaFilters>({});

  useGroupRealtime(id);

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const ideas = useGroupIdeas(supabase, id, filters);
  const voteState = useGroupVoteState(supabase, id, myUserId ?? '');
  const commentCounts = useGroupCommentCounts(supabase, id);
  const leaveGroup = useLeaveGroup(supabase);
  const removeMember = useRemoveMember(supabase);

  if (group.isPending || members.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
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

  // "Upcoming" = on-radar ideas dated today-or-later, soonest first.
  // event_date is YYYY-MM-DD so a string compare is chronological.
  const todayStr = new Date().toLocaleDateString('en-CA');
  const upcoming = (ideas.data ?? [])
    .filter((i) => i.status === 'on_radar' && i.event_date && i.event_date >= todayStr)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

  // "Do it again?" = done ideas, oldest first, capped — a revive nudge.
  const doAgain = (ideas.data ?? [])
    .filter((i) => i.status === 'done')
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
    .slice(0, 3);

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

              <View style={styles.actionRow}>
                <Button
                  label="🎲 Pick for us"
                  onPress={() => router.push(`/groups/${id}/picker`)}
                />
                <Button
                  label="History"
                  variant="ghost"
                  onPress={() => router.push(`/groups/${id}/history`)}
                />
              </View>

              {upcoming.length > 0 ? (
                <View style={styles.upcomingBlock}>
                  <Text style={styles.sectionTitle}>Upcoming</Text>
                  {upcoming.map((idea) => (
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
                        <Text style={styles.ideaMeta} numberOfLines={1}>
                          📅 {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}
                          {idea.location ? `  📍 ${idea.location}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.ideasHeader}>
                <Text style={styles.sectionTitle}>
                  Ideas{ideas.isSuccess ? ` (${ideas.data.length})` : ''}
                </Text>
                <Button label="New idea" onPress={() => router.push(`/groups/${id}/ideas/new`)} />
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
                <ActivityIndicator color={c.brand[600]} />
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
                      {idea.event_date || idea.location ? (
                        <Text style={styles.ideaMeta} numberOfLines={1}>
                          {idea.event_date
                            ? `📅 ${new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}`
                            : ''}
                          {idea.event_date && idea.location ? '  ' : ''}
                          {idea.location ? `📍 ${idea.location}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.ideaBadges}>
                      {(voteState.data?.countByIdea[idea.id] ?? 0) > 0 ? (
                        <Text style={styles.voteCount}>
                          ❤ {voteState.data?.countByIdea[idea.id]}
                        </Text>
                      ) : null}
                      {(commentCounts.data?.[idea.id] ?? 0) > 0 ? (
                        <Text style={styles.voteCount}>💬 {commentCounts.data?.[idea.id]}</Text>
                      ) : null}
                      <CategoryBadge category={idea.category} />
                      <StatusBadge status={idea.status} />
                    </View>
                  </Pressable>
                ))
              )}

              {doAgain.length > 0 ? (
                <View style={styles.upcomingBlock}>
                  <Text style={styles.sectionTitle}>Do it again?</Text>
                  {doAgain.map((idea) => (
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
                          done {new Date(idea.updated_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

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
                  {item.userId === myUserId ? <Text style={styles.you}> (you)</Text> : null}
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
                    onConfirm={() => removeMember.mutate({ groupId: id, userId: item.userId })}
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
    headerActions: { flexDirection: 'row', gap: 4 },
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
    groupName: { fontSize: 20, fontWeight: '700', color: c.text },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    sectionTitle: {
      marginTop: 16,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    list: { paddingVertical: 12, gap: 8 },
    memberRow: {
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
    memberInfo: { flexShrink: 1 },
    memberName: { fontSize: 14, fontWeight: '600', color: c.text },
    you: { color: c.faint, fontWeight: '400' },
    memberUsername: { fontSize: 12, color: c.muted },
    memberActions: { alignItems: 'flex-end', gap: 8 },
    footer: {
      marginTop: 24,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    ideasBlock: { gap: 10 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ideasHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    mutedText: { fontSize: 13, color: c.muted },
    ideaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    ideaRowPressed: { backgroundColor: c.surface2 },
    upcomingBlock: { gap: 8, marginBottom: 8 },
    ideaInfo: { flexShrink: 1 },
    ideaTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    ideaMeta: { fontSize: 12, color: c.muted },
    ideaBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
    voteCount: { fontSize: 12, fontWeight: '600', color: c.muted },
    membersTitle: { marginTop: 20 },
  });

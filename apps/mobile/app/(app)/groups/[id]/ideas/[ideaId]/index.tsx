import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroupMembers } from '@huddle/api-client/groups-hooks';
import {
  useIdea,
  useUpdateIdeaStatus,
  useDeleteIdea,
  useIdeaPhotoUrl,
} from '@huddle/api-client/ideas-hooks';
import { isHuddleError } from '@huddle/api-client/errors';
import { useReportIdea, useBlockUser } from '@huddle/api-client/moderation-hooks';
import { useGroupVoteState, useVoteIdea } from '@huddle/api-client/votes-hooks';
import {
  useIdeaComments,
  useAddComment,
  useDeleteComment,
} from '@huddle/api-client/comments-hooks';
import type { ReportReason } from '@huddle/validation';
import { supabase } from '@/lib/supabase';
import { googleCalendarUrl } from '@/lib/calendar';
import { useAuth } from '@/context/AuthContext';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';
import { ConfirmAction } from '@/components/ConfirmAction';
import { CategoryBadge, StatusBadge } from '@/components/IdeaBadges';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

export default function IdeaDetailScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id, ideaId } = useLocalSearchParams<{ id: string; ideaId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  useGroupRealtime(id);

  const idea = useIdea(supabase, ideaId);
  const members = useGroupMembers(supabase, id);
  const updateStatus = useUpdateIdeaStatus(supabase);
  const deleteIdea = useDeleteIdea(supabase, id);
  const photoUrl = useIdeaPhotoUrl(supabase, idea.data?.photo_path ?? null);
  const reportIdea = useReportIdea(supabase, myUserId ?? '');
  const blockUser = useBlockUser(supabase, myUserId ?? '');
  const voteState = useGroupVoteState(supabase, id, myUserId ?? '');
  const vote = useVoteIdea(supabase, id);
  const comments = useIdeaComments(supabase, id, ideaId);
  const addComment = useAddComment(supabase, id, ideaId);
  const deleteComment = useDeleteComment(supabase, id, ideaId);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [commentText, setCommentText] = useState('');

  // Map a delete failure to friendly copy. The NO ACTION FK (migration
  // 015) rejects deleting an idea chosen in a past pick (Postgres 23503).
  const deleteErrorMessage = (e: unknown): string => {
    if (isHuddleError(e)) {
      if (e.huddle.kind === 'unauthorized') {
        return 'Only the proposer or an admin can delete an idea.';
      }
      if (e.huddle.code === '23503') {
        return 'This idea was chosen in a past pick. Dismiss it instead to keep your history.';
      }
    }
    return 'Could not delete the idea.';
  };

  if (idea.isPending || members.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
      </View>
    );
  }

  if (idea.isError || members.isError || idea.data.group_id !== id) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Idea not found</Text>
        <Button
          label="Back to group"
          variant="secondary"
          onPress={() => router.replace(`/groups/${id}`)}
        />
      </View>
    );
  }

  const isAdmin = members.data.find((m) => m.userId === myUserId)?.role === 'admin';
  // UI convention only — RLS allows any member to edit (Phase 1 model).
  // Delete IS RLS-enforced to proposer/admin.
  const canManage = isAdmin || idea.data.proposed_by === myUserId;

  const setStatus = (status: 'on_radar' | 'done' | 'dismissed') => {
    setStatusError(null);
    updateStatus.mutate(
      { ideaId, status },
      { onError: () => setStatusError('Could not update the status. Try again.') },
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.replace(`/groups/${id}`)} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title} testID="idea-title">
            {idea.data.title}
          </Text>
          <View style={styles.badges}>
            <CategoryBadge category={idea.data.category} />
            <StatusBadge status={idea.data.status} />
          </View>
          <Text style={styles.meta}>
            Proposed by {idea.data.proposer?.display_name ?? 'someone'} on{' '}
            {new Date(idea.data.created_at).toLocaleDateString()}
          </Text>

          {idea.data.event_date ? (
            <Text style={styles.detailLine} testID="idea-date">
              📅 {new Date(`${idea.data.event_date}T00:00:00`).toLocaleDateString()}
            </Text>
          ) : null}
          {idea.data.location ? (
            <Text style={styles.detailLine} testID="idea-location">
              📍 {idea.data.location}
            </Text>
          ) : null}
          {idea.data.event_date ? (
            <Button
              label="📅 Add to calendar"
              variant="secondary"
              onPress={() =>
                Linking.openURL(
                  googleCalendarUrl({
                    title: idea.data.title,
                    date: idea.data.event_date!,
                    location: idea.data.location,
                    details: idea.data.description,
                  }),
                )
              }
            />
          ) : null}

          {(() => {
            const voted = voteState.data?.myVotes.includes(ideaId) ?? false;
            const count = voteState.data?.countByIdea[ideaId] ?? 0;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: voted }}
                disabled={vote.isPending || voteState.isPending}
                onPress={() => vote.mutate({ ideaId, voted })}
                style={[styles.voteBtn, voted && styles.voteBtnOn]}
              >
                <Text style={[styles.voteText, voted && styles.voteTextOn]}>
                  {voted ? '❤' : '🤍'} {count}
                </Text>
              </Pressable>
            );
          })()}

          {photoUrl.data ? (
            <Image source={{ uri: photoUrl.data }} style={styles.photo} testID="idea-photo" />
          ) : null}

          {idea.data.description ? (
            <Text style={styles.description}>{idea.data.description}</Text>
          ) : null}

          {idea.data.link ? (
            <Text style={styles.link} onPress={() => Linking.openURL(idea.data.link!)}>
              {idea.data.link}
            </Text>
          ) : null}

          <View style={styles.statusRow}>
            {idea.data.status !== 'done' ? (
              <Button
                label="Mark done"
                variant="secondary"
                loading={updateStatus.isPending}
                onPress={() => setStatus('done')}
              />
            ) : null}
            {idea.data.status !== 'dismissed' ? (
              <Button
                label="Dismiss"
                variant="ghost"
                disabled={updateStatus.isPending}
                onPress={() => setStatus('dismissed')}
              />
            ) : null}
            {idea.data.status !== 'on_radar' ? (
              <Button
                label="Back on the radar"
                variant="secondary"
                loading={updateStatus.isPending}
                onPress={() => setStatus('on_radar')}
              />
            ) : null}
          </View>
          {statusError ? (
            <View style={styles.alert}>
              <Text style={styles.alertText} accessibilityRole="alert">
                {statusError}
              </Text>
            </View>
          ) : null}
        </View>

        {canManage ? (
          <View style={styles.manageRow}>
            <Button
              label="Edit idea"
              variant="secondary"
              onPress={() => router.push(`/groups/${id}/ideas/${ideaId}/edit`)}
            />
            <ConfirmAction
              buttonLabel="Delete idea"
              confirmPrompt="Delete this idea? This cannot be undone."
              confirmLabel="Delete idea"
              variant="secondary"
              pending={deleteIdea.isPending}
              error={deleteIdea.isError ? deleteErrorMessage(deleteIdea.error) : null}
              onConfirm={() =>
                deleteIdea.mutate(
                  { ideaId, photoPath: idea.data.photo_path },
                  { onSuccess: () => router.replace(`/groups/${id}`) },
                )
              }
            />
          </View>
        ) : null}

        <View style={styles.commentsBlock}>
          <Text style={styles.sectionLabel}>
            Discussion{comments.isSuccess ? ` (${comments.data.length})` : ''}
          </Text>
          {idea.data.status === 'done' ? (
            <Text style={styles.completionPrompt}>
              How was it? Drop a quick note for the group — what to remember for next time.
            </Text>
          ) : null}
          {comments.isPending ? (
            <ActivityIndicator color={c.brand[600]} />
          ) : comments.isError ? (
            <Text style={styles.mutedText}>Couldn&apos;t load the discussion.</Text>
          ) : comments.data.length === 0 ? (
            <Text style={styles.mutedText}>No comments yet. Start the discussion.</Text>
          ) : (
            comments.data.map((cm) => {
              const canDelete = cm.author?.id === myUserId || isAdmin;
              return (
                <View key={cm.id} style={styles.comment}>
                  <View style={styles.commentHead}>
                    <Text style={styles.commentAuthor}>
                      {cm.author?.display_name ?? 'A former member'}
                    </Text>
                    {canDelete ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete comment"
                        onPress={() => deleteComment.mutate(cm.id)}
                      >
                        <Text style={styles.commentDelete}>Delete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={styles.commentBody}>{cm.body}</Text>
                </View>
              );
            })
          )}

          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment…"
            placeholderTextColor={c.faint}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={2000}
          />
          <Button
            label="Comment"
            variant="secondary"
            loading={addComment.isPending}
            disabled={commentText.trim().length === 0}
            onPress={() =>
              addComment.mutate(commentText.trim(), {
                onSuccess: () => setCommentText(''),
              })
            }
          />
        </View>

        {idea.data.proposed_by && idea.data.proposed_by !== myUserId ? (
          <View style={styles.moderation}>
            {reported ? (
              <Text style={styles.mutedText}>Reported — thanks, we&rsquo;ll review it.</Text>
            ) : reportOpen ? (
              <View style={styles.reportBox}>
                <Text style={styles.reportTitle}>Why are you reporting this?</Text>
                {REPORT_REASONS.map((r) => (
                  <Button
                    key={r.value}
                    label={r.label}
                    variant="secondary"
                    disabled={reportIdea.isPending}
                    onPress={() =>
                      reportIdea.mutate(
                        { ideaId, reason: r.value },
                        {
                          onSuccess: () => {
                            setReported(true);
                            setReportOpen(false);
                          },
                          onError: (e) => {
                            // Already reported → treat as done; else surface.
                            if (isHuddleError(e) && e.huddle.kind === 'conflict') {
                              setReported(true);
                              setReportOpen(false);
                            } else {
                              Alert.alert('Could not report', 'Please try again.');
                            }
                          },
                        },
                      )
                    }
                  />
                ))}
                <Button label="Cancel" variant="ghost" onPress={() => setReportOpen(false)} />
              </View>
            ) : (
              <Button label="Report" variant="ghost" onPress={() => setReportOpen(true)} />
            )}
            <ConfirmAction
              buttonLabel={`Block @${idea.data.proposer?.username ?? 'user'}`}
              confirmPrompt="Block this person? You won't see their ideas anymore. Undo in Settings → Blocked users."
              confirmLabel="Block"
              variant="secondary"
              pending={blockUser.isPending}
              error={blockUser.isError ? 'Could not block this person.' : null}
              onConfirm={() =>
                blockUser.mutate(idea.data.proposed_by!, {
                  onSuccess: () => router.replace(`/groups/${id}`),
                })
              }
            />
          </View>
        ) : null}
      </ScrollView>
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
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    scroll: { padding: 16, gap: 16 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 10,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    badges: { flexDirection: 'row', gap: 8 },
    meta: { fontSize: 12, color: c.muted },
    detailLine: { fontSize: 14, color: c.text },
    voteBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    voteBtnOn: { borderColor: c.brand[600], backgroundColor: c.brandBg },
    voteText: { fontSize: 13, fontWeight: '600', color: c.muted },
    voteTextOn: { color: c.brandInk },
    photo: {
      width: '100%',
      height: 220,
      borderRadius: 8,
      backgroundColor: c.surface2,
    },
    description: { fontSize: 14, color: c.text, lineHeight: 20 },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      textDecorationLine: 'underline',
    },
    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    manageRow: { flexDirection: 'row', gap: 8 },
    commentsBlock: {
      marginTop: 8,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 8,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    comment: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    commentHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    commentAuthor: { fontSize: 13, fontWeight: '600', color: c.text },
    commentDelete: { fontSize: 12, color: c.muted },
    commentBody: { fontSize: 14, color: c.text, lineHeight: 19 },
    completionPrompt: {
      fontSize: 13,
      color: c.text,
      backgroundColor: c.surface2,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    commentInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: c.text,
      minHeight: 44,
    },
    moderation: {
      marginTop: 8,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 8,
    },
    reportBox: {
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
    },
    reportTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    mutedText: { fontSize: 13, color: c.muted },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
  });

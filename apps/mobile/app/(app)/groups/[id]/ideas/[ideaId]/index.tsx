import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';
import { ConfirmAction } from '@/components/ConfirmAction';
import { CategoryBadge, StatusBadge } from '@/components/IdeaBadges';

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
  const [statusError, setStatusError] = useState<string | null>(null);

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
        <Button
          label="← Back"
          variant="ghost"
          onPress={() => router.replace(`/groups/${id}`)}
        />
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

          {photoUrl.data ? (
            <Image
              source={{ uri: photoUrl.data }}
              style={styles.photo}
              testID="idea-photo"
            />
          ) : null}

          {idea.data.description ? (
            <Text style={styles.description}>{idea.data.description}</Text>
          ) : null}

          {idea.data.link ? (
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(idea.data.link!)}
            >
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
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
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
  alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
  alertText: { color: c.dangerText, fontSize: 13 },
  heading: { fontSize: 18, fontWeight: '600', color: c.text },
});

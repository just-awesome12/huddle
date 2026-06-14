import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useGroupMembers } from '@huddle/api-client/groups-hooks';
import {
  useIdea,
  useUpdateIdea,
  useUploadIdeaPhoto,
  useRemoveIdeaPhoto,
  useIdeaPhotoUrl,
} from '@huddle/api-client/ideas-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { IdeaForm, type IdeaFormValues, type PickedPhoto } from '@/components/IdeaForm';

export default function EditIdeaScreen() {
  const { id, ideaId } = useLocalSearchParams<{ id: string; ideaId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const idea = useIdea(supabase, ideaId);
  const members = useGroupMembers(supabase, id);
  const updateIdea = useUpdateIdea(supabase);
  const uploadPhoto = useUploadIdeaPhoto(supabase);
  const removePhoto = useRemoveIdeaPhoto(supabase, id);
  const photoUrl = useIdeaPhotoUrl(supabase, idea.data?.photo_path ?? null);
  const [formError, setFormError] = useState<string | null>(null);

  if (idea.isPending || members.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
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

  // UI convention: proposer or admin only (RLS allows any member).
  const isAdmin = members.data.find((m) => m.userId === myUserId)?.role === 'admin';
  if (!isAdmin && idea.data.proposed_by !== myUserId) {
    return <Redirect href={`/groups/${id}/ideas/${ideaId}`} />;
  }

  const done = () => router.replace(`/groups/${id}/ideas/${ideaId}`);

  const onSubmit = (
    values: IdeaFormValues,
    photo: PickedPhoto | null,
    remove: boolean,
  ) => {
    setFormError(null);
    updateIdea.mutate(
      { ideaId, params: values },
      {
        onSuccess: () => {
          if (photo) {
            uploadPhoto.mutate(
              {
                groupId: id,
                ideaId,
                data: photo.data,
                contentType: photo.contentType,
                previousPath: idea.data.photo_path,
              },
              { onSettled: done },
            );
          } else if (remove && idea.data.photo_path) {
            removePhoto.mutate(
              { ideaId, photoPath: idea.data.photo_path },
              { onSettled: done },
            );
          } else {
            done();
          }
        },
        onError: () => setFormError('Could not save the idea. Please try again.'),
      },
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Edit idea</Text>
        <View style={styles.spacer} />
      </View>
      <IdeaForm
        groupId={id}
        submitLabel="Save idea"
        pending={updateIdea.isPending || uploadPhoto.isPending || removePhoto.isPending}
        formError={formError}
        initial={{
          title: idea.data.title,
          description: idea.data.description ?? undefined,
          category: idea.data.category,
          link: idea.data.link ?? undefined,
        }}
        currentPhotoUrl={photoUrl.data ?? null}
        onSubmit={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6fd' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f7f6fd',
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
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  spacer: { width: 64 },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
});

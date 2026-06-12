import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateIdea, useUploadIdeaPhoto } from '@huddle/api-client/ideas-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { IdeaForm, type IdeaFormValues, type PickedPhoto } from '@/components/IdeaForm';

export default function NewIdeaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const createIdea = useCreateIdea(supabase);
  const uploadPhoto = useUploadIdeaPhoto(supabase);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = (values: IdeaFormValues, photo: PickedPhoto | null) => {
    setFormError(null);
    createIdea.mutate(
      { groupId: id, ...values },
      {
        onSuccess: (idea) => {
          if (!photo) {
            router.replace(`/groups/${id}/ideas/${idea.id}`);
            return;
          }
          uploadPhoto.mutate(
            {
              groupId: id,
              ideaId: idea.id,
              data: photo.data,
              contentType: photo.contentType,
            },
            {
              // Either way the idea exists — go see it. A failed photo
              // can be retried from Edit.
              onSettled: () => router.replace(`/groups/${id}/ideas/${idea.id}`),
            },
          );
        },
        onError: () => setFormError('Could not add the idea. Please try again.'),
      },
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.heading}>Add an idea</Text>
        <View style={styles.spacer} />
      </View>
      <IdeaForm
        groupId={id}
        submitLabel="Add idea"
        pending={createIdea.isPending || uploadPhoto.isPending}
        formError={formError}
        onSubmit={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
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
  heading: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  spacer: { width: 64 },
});

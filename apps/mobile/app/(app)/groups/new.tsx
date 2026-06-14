import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createGroupSchema } from '@huddle/validation';
import { useCreateGroup } from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';

export default function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const createGroup = useCreateGroup(supabase);

  const onSubmit = () => {
    setFieldError(undefined);
    setFormError(null);

    const parsed = createGroupSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.name?.[0]);
      return;
    }

    createGroup.mutate(parsed.data.name, {
      onSuccess: (group) => {
        router.replace(`/groups/${group.id}`);
      },
      onError: () => {
        setFormError('Could not create the group. Please try again.');
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Button label="← Back" variant="ghost" onPress={() => router.back()} />
          <Text style={styles.heading}>Create a group</Text>
          <Text style={styles.muted}>
            You&apos;ll be the admin. You can invite people once it exists.
          </Text>

          <FormField
            label="Group name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            hint="Up to 80 characters. You can rename it later."
            error={fieldError}
            autoCapitalize="words"
          />

          {formError ? (
            <View style={styles.alert}>
              <Text style={styles.alertText} accessibilityRole="alert">
                {formError}
              </Text>
            </View>
          ) : null}

          <Button label="Create group" onPress={onSubmit} loading={createGroup.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f6fd' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 16,
  },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  muted: { color: '#64748b', fontSize: 14 },
  alert: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  alertText: { color: '#b91c1c', fontSize: 13 },
});

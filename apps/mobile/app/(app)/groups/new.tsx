import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { createGroupSchema, type GroupVisibility } from '@huddle/validation';
import { useCreateGroup } from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { GroupFormFields } from '@/components/GroupFormFields';

export default function NewGroupScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('invite_only');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const createGroup = useCreateGroup(supabase);

  const onSubmit = () => {
    setFieldError(undefined);
    setFormError(null);

    const parsed = createGroupSchema.safeParse({
      name,
      description,
      location,
      tags: tags.split(','),
      visibility,
    });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldError(errors.name?.[0]);
      setFormError(errors.tags?.[0] ?? errors.description?.[0] ?? errors.location?.[0] ?? null);
      return;
    }

    createGroup.mutate(
      {
        name: parsed.data.name,
        description: parsed.data.description,
        location: parsed.data.location,
        tags: parsed.data.tags,
        visibility: parsed.data.visibility,
      },
      {
        onSuccess: (group) => {
          router.replace(`/groups/${group.id}`);
        },
        onError: () => {
          setFormError('Could not create the group. Please try again.');
        },
      },
    );
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

          <GroupFormFields
            description={description}
            onChangeDescription={setDescription}
            location={location}
            onChangeLocation={setLocation}
            tags={tags}
            onChangeTags={setTags}
            visibility={visibility}
            onChangeVisibility={setVisibility}
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 16,
    },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    muted: { color: c.muted, fontSize: 14 },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
  });

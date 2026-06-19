import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { createGroupSchema } from '@huddle/validation';
import {
  useGroup,
  useGroupMembers,
  useUpdateGroup,
  useDeleteGroup,
} from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ConfirmAction } from '@/components/ConfirmAction';

export default function GroupSettingsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const updateGroup = useUpdateGroup(supabase);
  const deleteGroup = useDeleteGroup(supabase);

  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [renamed, setRenamed] = useState(false);

  // Seed the input once the group loads (and after an external rename).
  useEffect(() => {
    if (group.data) setName(group.data.name);
  }, [group.data]);

  if (group.isPending || members.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
      </View>
    );
  }

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

  // Settings is admin-only. RLS would reject the mutations anyway;
  // this redirect is UX, not security.
  const myMembership = members.data.find((m) => m.userId === myUserId);
  if (myMembership?.role !== 'admin') {
    return <Redirect href={`/groups/${id}`} />;
  }

  const onRename = () => {
    setFieldError(undefined);
    setFormError(null);
    setRenamed(false);

    const parsed = createGroupSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.name?.[0]);
      return;
    }

    updateGroup.mutate(
      { groupId: id, name: parsed.data.name },
      {
        onSuccess: () => setRenamed(true),
        onError: () => setFormError('Could not rename the group. Please try again.'),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Button
          label={`← Back to ${group.data.name}`}
          variant="ghost"
          onPress={() => router.replace(`/groups/${id}`)}
        />
        <Text style={styles.heading}>Group settings</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rename</Text>
          <FormField
            label="Group name"
            value={name}
            onChangeText={setName}
            maxLength={80}
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
          {renamed ? (
            <View style={styles.success}>
              <Text style={styles.successText}>Group renamed.</Text>
            </View>
          ) : null}
          <Button label="Save name" onPress={onRename} loading={updateGroup.isPending} />
        </View>

        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>Danger zone</Text>
          <Text style={styles.muted}>
            Deleting a group permanently removes its members, ideas, and decision history.
          </Text>
          <ConfirmAction
            buttonLabel="Delete group"
            confirmPrompt={`Delete "${group.data.name}" and everything in it? This cannot be undone.`}
            confirmLabel="Delete group"
            pending={deleteGroup.isPending}
            error={deleteGroup.isError ? 'Could not delete the group.' : null}
            onConfirm={() =>
              deleteGroup.mutate(id, {
                onSuccess: () => router.replace('/groups'),
              })
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: c.canvas,
    },
    scroll: { padding: 16, gap: 16 },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 12,
    },
    dangerCard: { borderColor: '#fecaca', backgroundColor: c.dangerBg },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    dangerTitle: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.dangerText,
    },
    muted: { color: c.muted, fontSize: 13, lineHeight: 18 },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    success: { backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8 },
    successText: { color: '#15803d', fontSize: 13 },
  });

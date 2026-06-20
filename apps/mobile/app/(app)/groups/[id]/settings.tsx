import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { updateGroupSchema, type GroupVisibility } from '@huddle/validation';
import {
  useGroup,
  useGroupMembers,
  useUpdateGroupFields,
  useDeleteGroup,
  useJoinRequests,
  useRespondToJoinRequest,
} from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { GroupFormFields } from '@/components/GroupFormFields';
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
  const updateGroup = useUpdateGroupFields(supabase);
  const deleteGroup = useDeleteGroup(supabase);
  const requests = useJoinRequests(supabase, id);
  const respond = useRespondToJoinRequest(supabase);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('invite_only');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the inputs once the group loads.
  useEffect(() => {
    if (group.data) {
      setName(group.data.name);
      setDescription(group.data.description ?? '');
      setLocation(group.data.location ?? '');
      setTags((group.data.tags ?? []).join(', '));
      setVisibility(group.data.visibility);
    }
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

  const onSave = () => {
    setFieldError(undefined);
    setFormError(null);
    setSaved(false);

    const parsed = updateGroupSchema.safeParse({
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

    updateGroup.mutate(
      { groupId: id, patch: parsed.data },
      {
        onSuccess: () => setSaved(true),
        onError: () => setFormError('Could not save changes. Please try again.'),
      },
    );
  };

  const pending = requests.data ?? [];

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
          <Text style={styles.sectionTitle}>Details</Text>
          <FormField
            label="Group name"
            value={name}
            onChangeText={setName}
            maxLength={80}
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
          {saved ? (
            <View style={styles.success}>
              <Text style={styles.successText}>Saved.</Text>
            </View>
          ) : null}
          <Button label="Save changes" onPress={onSave} loading={updateGroup.isPending} />
        </View>

        {/* Join requests (public groups) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Join requests ({pending.length})</Text>
          {requests.isPending ? (
            <ActivityIndicator color={c.brand[600]} />
          ) : pending.length === 0 ? (
            <Text style={styles.muted}>No pending requests.</Text>
          ) : (
            pending.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{r.profile.display_name}</Text>
                  <Text style={styles.muted}>@{r.profile.username}</Text>
                  {r.message ? <Text style={styles.muted}>“{r.message}”</Text> : null}
                </View>
                <View style={styles.requestActions}>
                  <Button
                    label="Approve"
                    loading={respond.isPending}
                    onPress={() => respond.mutate({ requestId: r.id, approve: true, groupId: id })}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => respond.mutate({ requestId: r.id, approve: false, groupId: id })}
                  >
                    <Text style={styles.reject}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
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
    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    requestInfo: { flexShrink: 1, gap: 2 },
    requestName: { fontSize: 14, fontWeight: '600', color: c.text },
    requestActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    reject: { fontSize: 14, fontWeight: '600', color: c.muted },
  });

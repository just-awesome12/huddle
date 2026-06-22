import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  updateGroupSchema,
  GROUP_EMOJIS,
  GROUP_COLORS,
  type GroupVisibility,
} from '@huddle/validation';
import {
  useGroup,
  useGroupMembers,
  useUpdateGroupFields,
  useUploadGroupCover,
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

/** Hermes has atob; convert base64 → ArrayBuffer without extra deps. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

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
  const uploadCover = useUploadGroupCover(supabase);
  const deleteGroup = useDeleteGroup(supabase);
  const requests = useJoinRequests(supabase, id);
  const respond = useRespondToJoinRequest(supabase);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('invite_only');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState('');
  const [lite, setLite] = useState(false);
  const [cover, setCover] = useState<{ data: ArrayBuffer; uri: string } | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed the inputs once the group loads.
  useEffect(() => {
    if (group.data) {
      setName(group.data.name);
      setDescription(group.data.description ?? '');
      setLocation(group.data.location ?? '');
      setTags((group.data.tags ?? []).join(', '));
      setVisibility(group.data.visibility);
      setEmoji(group.data.emoji ?? '');
      setColor(group.data.color ?? '');
      setLite(group.data.lite_mode);
      setCoverUrl(group.data.cover_photo_path ?? null);
    }
  }, [group.data]);

  // Lite mode (16d): a dedicated instant toggle (separate from the form's
  // Save button), optimistic with revert — mirrors the web settings toggle.
  const toggleLite = async (next: boolean) => {
    setLite(next);
    try {
      await updateGroup.mutateAsync({ groupId: id, patch: { lite_mode: next } });
    } catch {
      setLite(!next);
    }
  };

  const pickCover = async () => {
    setFormError(null);
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      const context = ImageManipulator.manipulate(asset.uri);
      if (asset.width > 1200) context.resize({ width: 1200 });
      const rendered = await context.renderAsync();
      const out = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.8,
        base64: true,
      });
      if (!out.base64) {
        setFormError('Could not process that image.');
        return;
      }
      setCover({ data: base64ToArrayBuffer(out.base64), uri: out.uri });
    } catch {
      setFormError('Could not pick that image.');
    } finally {
      setBusy(false);
    }
  };

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

  const onSave = async () => {
    setFieldError(undefined);
    setFormError(null);
    setSaved(false);

    const parsed = updateGroupSchema.safeParse({
      name,
      description,
      location,
      tags: tags.split(','),
      visibility,
      ...(emoji ? { emoji } : {}),
      ...(color ? { color } : {}),
    });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldError(errors.name?.[0]);
      setFormError(errors.tags?.[0] ?? errors.description?.[0] ?? errors.location?.[0] ?? null);
      return;
    }

    setBusy(true);
    try {
      const patch = { ...parsed.data } as typeof parsed.data & { cover_photo_path?: string };
      if (cover) {
        patch.cover_photo_path = await uploadCover.mutateAsync({
          groupId: id,
          params: { data: cover.data, contentType: 'image/jpeg', ext: 'jpg' },
        });
      }
      await updateGroup.mutateAsync({ groupId: id, patch });
      if (patch.cover_photo_path) setCoverUrl(patch.cover_photo_path);
      setCover(null);
      setSaved(true);
    } catch {
      setFormError('Could not save changes. Please try again.');
    } finally {
      setBusy(false);
    }
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

          <Text style={styles.pickerLabel}>Emoji</Text>
          <View style={styles.pickerRow}>
            {GROUP_EMOJIS.map((e) => (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityState={{ selected: e === emoji }}
                onPress={() => setEmoji(e)}
                style={[styles.emojiCell, e === emoji && styles.emojiCellOn]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.pickerLabel}>Accent color</Text>
          <View style={styles.pickerRow}>
            {GROUP_COLORS.map((hex) => (
              <Pressable
                key={hex}
                accessibilityRole="button"
                accessibilityLabel={`Color ${hex}`}
                accessibilityState={{ selected: hex === color }}
                onPress={() => setColor(hex)}
                style={[styles.swatch, { backgroundColor: hex }, hex === color && styles.swatchOn]}
              />
            ))}
          </View>

          <Text style={styles.pickerLabel}>Cover photo</Text>
          <View style={styles.coverRow}>
            {cover?.uri || coverUrl ? (
              <Image source={{ uri: cover?.uri ?? coverUrl ?? '' }} style={styles.coverPreview} />
            ) : (
              <View style={[styles.coverPreview, { backgroundColor: c.surface2 }]} />
            )}
            <Button label="Choose cover" variant="secondary" loading={busy} onPress={pickCover} />
          </View>

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
          <Button label="Save changes" onPress={onSave} loading={busy || updateGroup.isPending} />
        </View>

        {/* Group mode (16d) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Group mode</Text>
          <View style={styles.liteRow}>
            <View style={styles.liteText}>
              <Text style={styles.liteLabel}>Lite mode</Text>
              <Text style={styles.muted}>
                A simpler hub for small groups — hides polls, the activity feed, and re-engagement
                nudges. Great for couples or roommates.
              </Text>
            </View>
            <Switch
              value={lite}
              onValueChange={toggleLite}
              trackColor={{ true: c.brand[600] }}
              accessibilityLabel="Lite mode"
            />
          </View>
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
    liteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    liteText: { flex: 1 },
    liteLabel: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 2 },
    pickerLabel: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 4 },
    pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    emojiCell: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface2,
    },
    emojiCellOn: { borderWidth: 2, borderColor: c.brand[600] },
    emojiText: { fontSize: 20 },
    swatch: { width: 34, height: 34, borderRadius: 17 },
    swatchOn: { borderWidth: 3, borderColor: c.text },
    coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    coverPreview: { width: 96, height: 56, borderRadius: 10 },
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

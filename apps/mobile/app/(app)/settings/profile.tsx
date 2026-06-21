import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { displayNameSchema, bioSchema } from '@huddle/validation';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@huddle/api-client/profiles-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';

/** Hermes has atob; convert base64 → ArrayBuffer without extra deps. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default function ProfileSettingsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const profile = useProfile(supabase, userId, { enabled: !!userId });
  const update = useUpdateProfile(supabase, userId);
  const uploadAvatar = useUploadAvatar(supabase);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [pickedAvatar, setPickedAvatar] = useState<{ data: ArrayBuffer; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name);
      setBio(profile.data.bio ?? '');
    }
  }, [profile.data]);

  const pickAvatar = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize(asset.width >= asset.height ? { width: 256 } : { height: 256 });
      const rendered = await context.renderAsync();
      const out = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.8,
        base64: true,
      });
      if (!out.base64) {
        setError('Could not process that image.');
        return;
      }
      setPickedAvatar({ data: base64ToArrayBuffer(out.base64), uri: out.uri });
    } catch {
      setError('Could not pick that image.');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setError(null);
    setSaved(false);
    const dn = displayNameSchema.safeParse(name);
    if (!dn.success) {
      setError(dn.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    const b = bioSchema.safeParse(bio);
    if (!b.success) {
      setError(b.error.issues[0]?.message ?? 'Invalid bio');
      return;
    }
    setBusy(true);
    try {
      let avatarUrl: string | undefined;
      if (pickedAvatar) {
        avatarUrl = await uploadAvatar.mutateAsync({
          data: pickedAvatar.data,
          contentType: 'image/jpeg',
          ext: 'jpg',
        });
      }
      await update.mutateAsync({
        display_name: dn.data,
        bio: b.data || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });
      setPickedAvatar(null);
      setSaved(true);
    } catch {
      setError('Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (profile.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
      </View>
    );
  }

  const previewUri = pickedAvatar?.uri ?? profile.data?.avatar_url ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile</Text>

        <View style={styles.avatarRow}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{(name[0] ?? '?').toUpperCase()}</Text>
            </View>
          )}
          <Button label="Change photo" variant="secondary" loading={busy} onPress={pickAvatar} />
        </View>

        <FormField
          label="Display name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoCapitalize="words"
        />
        <FormField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          maxLength={160}
          multiline
          numberOfLines={2}
          placeholder="A line about you (optional)"
          style={styles.bio}
          autoCapitalize="sentences"
        />

        {error ? (
          <View style={styles.alert}>
            <Text style={styles.alertText} accessibilityRole="alert">
              {error}
            </Text>
          </View>
        ) : null}
        {saved ? <Text style={styles.saved}>Saved.</Text> : null}

        <Button label="Save profile" onPress={onSave} loading={busy || update.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.canvas },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    scroll: { padding: 16, gap: 14 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatar: { width: 64, height: 64, borderRadius: 32 },
    avatarFallback: {
      backgroundColor: c.brand[600],
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
    bio: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    saved: { color: '#15803d', fontSize: 13, fontWeight: '600' },
  });

import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createIdeaSchema, type IdeaCategory } from '@huddle/validation';
import { CATEGORY_LABELS } from './IdeaBadges';
import { Button } from './Button';
import { FormField } from './FormField';
import { relativeDateChips } from '@/lib/relative-dates';

export interface IdeaFormValues {
  title: string;
  description?: string;
  category: IdeaCategory;
  link?: string;
  eventDate?: string;
  location?: string;
}

/** A picked-and-compressed photo ready for upload. */
export interface PickedPhoto {
  data: ArrayBuffer;
  contentType: string;
  /** Local URI for previewing in the form. */
  uri: string;
}

interface IdeaFormProps {
  groupId: string;
  submitLabel: string;
  pending: boolean;
  formError: string | null;
  initial?: IdeaFormValues;
  /** Signed URL of the current photo (edit mode). */
  currentPhotoUrl?: string | null;
  onSubmit: (values: IdeaFormValues, photo: PickedPhoto | null, removePhoto: boolean) => void;
}

/** Hermes has atob; convert base64 → ArrayBuffer without extra deps. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function IdeaForm({
  groupId,
  submitLabel,
  pending,
  formError,
  initial,
  currentPhotoUrl,
  onSubmit,
}: IdeaFormProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<IdeaCategory>(initial?.category ?? 'food');
  const [link, setLink] = useState(initial?.link ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const pickPhoto = async () => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;

      // Compress to ≤1920px JPEG (~matches web's browser-side compression).
      const context = ImageManipulator.manipulate(asset.uri);
      if (asset.width > 1920 || asset.height > 1920) {
        context.resize(asset.width >= asset.height ? { width: 1920 } : { height: 1920 });
      }
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.8,
        base64: true,
      });
      if (!saved.base64) {
        setPhotoError('Could not process that image. Try a different one.');
        return;
      }
      setPhoto({
        data: base64ToArrayBuffer(saved.base64),
        contentType: 'image/jpeg',
        uri: saved.uri,
      });
      setRemovePhoto(false);
    } catch {
      setPhotoError('Could not process that image. Try a different one.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = () => {
    setFieldErrors({});
    const parsed = createIdeaSchema.safeParse({
      groupId,
      title,
      description,
      category,
      link,
      eventDate,
      location,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        title: flat.title?.[0],
        description: flat.description?.[0],
        link: flat.link?.[0],
        eventDate: flat.eventDate?.[0],
        location: flat.location?.[0],
      });
      return;
    }
    onSubmit(
      {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        link: parsed.data.link,
        eventDate: parsed.data.eventDate,
        location: parsed.data.location,
      },
      photo,
      removePhoto,
    );
  };

  const previewUri = photo?.uri ?? (removePhoto ? null : (currentPhotoUrl ?? null));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <FormField
            label="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            autoCapitalize="sentences"
            error={fieldErrors.title}
          />

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  onPress={() => setCategory(value)}
                  style={[styles.chip, category === value && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, category === value && styles.chipLabelActive]}>
                    {CATEGORY_LABELS[value]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              accessible
              accessibilityLabel="Description"
              multiline
              numberOfLines={4}
              maxLength={4000}
              value={description}
              onChangeText={setDescription}
              style={styles.textarea}
            />
            {fieldErrors.description ? (
              <Text style={styles.error}>{fieldErrors.description}</Text>
            ) : null}
          </View>

          <FormField
            label="Link (optional)"
            value={link}
            onChangeText={setLink}
            keyboardType="url"
            placeholder="https://…"
            hint="A menu, event page, map pin — anything useful."
            error={fieldErrors.link}
          />

          <FormField
            label="Date (optional)"
            value={eventDate}
            onChangeText={setEventDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            hint="When is this happening?"
            error={fieldErrors.eventDate}
          />
          <View style={styles.dateChips}>
            {relativeDateChips().map((chip) => (
              <Pressable
                key={chip.label}
                accessibilityRole="button"
                onPress={() => setEventDate(chip.value)}
                style={[styles.dateChip, eventDate === chip.value && styles.dateChipOn]}
              >
                <Text
                  style={[styles.dateChipText, eventDate === chip.value && styles.dateChipTextOn]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <FormField
            label="Location (optional)"
            value={location}
            onChangeText={setLocation}
            maxLength={200}
            placeholder="Where? A place, address, or area."
            autoCapitalize="sentences"
            error={fieldErrors.location}
          />

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Photo (optional)</Text>
            {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
            <View style={styles.row}>
              <Button
                label={previewUri ? 'Change photo' : 'Pick a photo'}
                variant="secondary"
                loading={photoBusy}
                onPress={pickPhoto}
              />
              {photo || (currentPhotoUrl && !removePhoto) ? (
                <Button
                  label="Remove photo"
                  variant="ghost"
                  onPress={() => {
                    setPhoto(null);
                    setRemovePhoto(true);
                  }}
                />
              ) : null}
            </View>
            {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
          </View>

          {formError ? (
            <View style={styles.alert}>
              <Text style={styles.alertText} accessibilityRole="alert">
                {formError}
              </Text>
            </View>
          ) : null}

          <Button label={submitLabel} onPress={submit} loading={pending || photoBusy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    scroll: { padding: 16 },
    dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    dateChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.surface2,
    },
    dateChipOn: { borderColor: c.brand[600], backgroundColor: c.brand[600] },
    dateChipText: { fontSize: 12, fontWeight: '600', color: c.muted },
    dateChipTextOn: { color: '#fff' },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 16,
    },
    fieldBlock: { gap: 4 },
    label: { fontSize: 13, fontWeight: '600', color: c.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.surface2,
    },
    chipActive: { backgroundColor: c.text },
    chipLabel: { fontSize: 13, fontWeight: '600', color: c.muted },
    chipLabelActive: { color: c.surface },
    textarea: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: c.surface,
      minHeight: 88,
      textAlignVertical: 'top',
    },
    preview: {
      width: '100%',
      height: 160,
      borderRadius: 8,
      backgroundColor: c.surface2,
    },
    row: { flexDirection: 'row', gap: 8 },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    error: { fontSize: 12, color: c.danger },
  });

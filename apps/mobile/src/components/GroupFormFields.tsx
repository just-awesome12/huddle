import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import type { GroupVisibility } from '@huddle/validation';
import { FormField } from './FormField';

/**
 * Shared description / location / tags / visibility inputs for the mobile
 * create + edit group screens. Controlled — the parent owns the state.
 */
export function GroupFormFields({
  description,
  onChangeDescription,
  location,
  onChangeLocation,
  tags,
  onChangeTags,
  visibility,
  onChangeVisibility,
}: {
  description: string;
  onChangeDescription: (v: string) => void;
  location: string;
  onChangeLocation: (v: string) => void;
  tags: string;
  onChangeTags: (v: string) => void;
  visibility: GroupVisibility;
  onChangeVisibility: (v: GroupVisibility) => void;
}) {
  const c = useColors();
  const styles = makeStyles(c);

  return (
    <>
      <FormField
        label="Description"
        value={description}
        onChangeText={onChangeDescription}
        maxLength={500}
        multiline
        numberOfLines={3}
        placeholder="What's this group about?"
        style={styles.multiline}
        autoCapitalize="sentences"
      />
      <FormField
        label="Location"
        value={location}
        onChangeText={onChangeLocation}
        maxLength={120}
        hint="Optional — e.g. Austin, TX"
        autoCapitalize="words"
      />
      <FormField
        label="Tags"
        value={tags}
        onChangeText={onChangeTags}
        hint="Comma-separated, up to 8 (e.g. food, hiking)"
      />

      <View style={styles.visWrap}>
        <Text style={styles.label}>Visibility</Text>
        <VisibilityOption
          selected={visibility === 'invite_only'}
          title="Invite-only"
          subtitle="People join by invite link or username."
          onPress={() => onChangeVisibility('invite_only')}
        />
        <VisibilityOption
          selected={visibility === 'public'}
          title="Public"
          subtitle="Discoverable in search; people can request to join."
          onPress={() => onChangeVisibility('public')}
        />
      </View>
    </>
  );
}

function VisibilityOption({
  selected,
  title,
  subtitle,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const c = useColors();
  const styles = makeStyles(c);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
    label: { fontSize: 13, fontWeight: '600', color: c.text },
    visWrap: { gap: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
    },
    optionSelected: { borderColor: c.brand[600], backgroundColor: c.brandBg },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    radioOn: { borderColor: c.brand[600] },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand[600] },
    optionText: { flexShrink: 1 },
    optionTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    optionSubtitle: { fontSize: 12, color: c.muted },
  });

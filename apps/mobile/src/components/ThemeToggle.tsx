import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, useColors, type ThemePref, type ThemeColors } from '@/context/ThemeContext';

/** Compact 3-way theme switch (system / light / dark) for headers. */
const OPTIONS: { value: ThemePref; glyph: string; label: string }[] = [
  { value: 'system', glyph: '◐', label: 'System theme' },
  { value: 'light', glyph: '☀', label: 'Light theme' },
  { value: 'dark', glyph: '☾', label: 'Dark theme' },
];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const c = useColors();
  const styles = makeStyles(c);

  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            onPress={() => setPref(opt.value)}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text style={[styles.glyph, active && styles.glyphActive]}>{opt.glyph}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    group: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: c.surface2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      padding: 2,
    },
    seg: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segActive: { backgroundColor: c.brand[600] },
    glyph: { fontSize: 12, color: c.muted },
    glyphActive: { color: c.white },
  });

import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  ...rest
}: ButtonProps) {
  const c = useColors();
  const v = variants(c);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        v[variant].bg,
        pressed && !isDisabled && v[variant].pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? c.white : c.brandInk}
        />
      ) : (
        <Text style={[styles.label, v[variant].label]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  label: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});

function variants(c: ThemeColors): Record<Variant, { bg: object; pressed: object; label: object }> {
  // Secondary/ghost use surface-2 in dark so they're not bright lavender
  // pills on a dark canvas; in light they keep the soft brand tint.
  const subtle = c.surface === '#ffffff' ? c.brand[50] : c.surface2;
  const subtlePressed = c.surface === '#ffffff' ? c.brand[100] : c.border;
  return {
    primary: {
      bg: { backgroundColor: c.brand[600] },
      pressed: { backgroundColor: c.brand[700] },
      label: { color: c.white },
    },
    secondary: {
      bg: { backgroundColor: subtle },
      pressed: { backgroundColor: subtlePressed },
      label: { color: c.brandInk },
    },
    ghost: {
      bg: { backgroundColor: 'transparent' },
      pressed: { backgroundColor: subtle },
      label: { color: c.muted },
    },
    danger: {
      bg: { backgroundColor: c.danger },
      pressed: { backgroundColor: c.dangerText },
      label: { color: c.white },
    },
  };
}

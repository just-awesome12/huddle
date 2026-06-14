import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { colors } from '@/lib/theme';

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
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isDisabled && variantPressed[variant],
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? '#fff' : '#0f172a'}
        />
      ) : (
        <Text style={[styles.label, variantLabel[variant]]}>{label}</Text>
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

const variantStyles: Record<Variant, object> = {
  primary: { backgroundColor: colors.brand[600] },
  secondary: { backgroundColor: colors.brand[50] },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};

const variantPressed: Record<Variant, object> = {
  primary: { backgroundColor: colors.brand[700] },
  secondary: { backgroundColor: colors.brand[100] },
  ghost: { backgroundColor: colors.brand[50] },
  danger: { backgroundColor: colors.dangerText },
};

const variantLabel: Record<Variant, object> = {
  primary: { color: colors.white },
  secondary: { color: colors.brand[800] },
  ghost: { color: '#475569' },
  danger: { color: colors.white },
};

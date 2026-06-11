import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

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
  primary: { backgroundColor: '#0f172a' },
  secondary: { backgroundColor: '#e2e8f0' },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: '#dc2626' },
};

const variantPressed: Record<Variant, object> = {
  primary: { backgroundColor: '#1e293b' },
  secondary: { backgroundColor: '#cbd5e1' },
  ghost: { backgroundColor: '#f1f5f9' },
  danger: { backgroundColor: '#b91c1c' },
};

const variantLabel: Record<Variant, object> = {
  primary: { color: '#fff' },
  secondary: { color: '#0f172a' },
  ghost: { color: '#475569' },
  danger: { color: '#fff' },
};

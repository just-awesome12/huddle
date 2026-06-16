import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';

interface FormFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function FormField({
  label,
  hint,
  error,
  style,
  ...rest
}: FormFieldProps) {
  const c = useColors();
  const styles = makeStyles(c);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessible
        accessibilityLabel={label}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        {...rest}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: c.text },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: c.surface,
    minHeight: 44,
  },
  inputError: { borderColor: '#ef4444', backgroundColor: c.dangerBg },
  hint: { fontSize: 12, color: c.muted },
  error: { fontSize: 12, color: c.danger },
});

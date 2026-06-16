import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Button } from './Button';

interface ConfirmActionProps {
  /** Label of the initial button. */
  buttonLabel: string;
  /** Question shown in the inline confirmation step. */
  confirmPrompt: string;
  /** Label of the confirming (destructive) button. */
  confirmLabel: string;
  /** Runs when the user confirms. */
  onConfirm: () => void;
  /** Pending state of the underlying mutation. */
  pending?: boolean;
  /** Inline error from the underlying mutation (D41 — no toasts). */
  error?: string | null;
  variant?: 'danger' | 'secondary';
}

/**
 * Inline two-step confirmation for destructive actions. Mirrors the
 * web ConfirmActionForm. Inline rather than Alert.alert so behaviour
 * is identical on iOS, Android, AND the Expo web preview (where
 * multi-button Alert.alert silently does nothing).
 */
export function ConfirmAction({
  buttonLabel,
  confirmPrompt,
  confirmLabel,
  onConfirm,
  pending = false,
  error,
  variant = 'danger',
}: ConfirmActionProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <View style={styles.wrap}>
        <Button
          label={buttonLabel}
          variant={variant}
          onPress={() => setConfirming(true)}
        />
        {error ? (
          <View style={styles.alert}>
            <Text style={styles.alertText} accessibilityRole="alert">
              {error}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{confirmPrompt}</Text>
      <View style={styles.row}>
        <Button
          label={confirmLabel}
          variant="danger"
          loading={pending}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="ghost"
          disabled={pending}
          onPress={() => setConfirming(false)}
        />
      </View>
      {error ? (
        <View style={styles.alert}>
          <Text style={styles.alertText} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { gap: 8 },
  prompt: { fontSize: 14, color: c.text },
  row: { flexDirection: 'row', gap: 8 },
  alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
  alertText: { color: c.dangerText, fontSize: 13 },
});

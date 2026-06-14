import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { onboardingSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';

/**
 * Onboarding screen.
 *
 * Shown to authenticated users whose profile still has the placeholder
 * username (u_<12hex>). This is the post-OAuth username-pick step.
 *
 * The AuthProvider's needsOnboarding flag controls when this screen
 * is reachable — the root layout redirects here whenever needsOnboarding
 * is true.
 */
export default function OnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const meta = session?.user.user_metadata ?? {};
  const suggested =
    (typeof meta.pending_display_name === 'string' && meta.pending_display_name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(suggested);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setFieldErrors({});
    setFormError(null);

    const parsed = onboardingSchema.safeParse({ username, displayName });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        username: flat.username?.[0] ?? '',
        displayName: flat.displayName?.[0] ?? '',
      });
      return;
    }

    if (!session?.user.id) {
      setFormError('You are signed out. Please sign in again.');
      return;
    }

    setPending(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        username: parsed.data.username,
        display_name: parsed.data.displayName,
      })
      .eq('id', session.user.id);
    setPending(false);

    if (error) {
      const mapped = mapSupabaseError(error);
      if (mapped.kind === 'conflict') {
        setFieldErrors({
          username: 'That username is already taken. Try another.',
        });
        return;
      }
      setFormError('Could not save your profile. Please try again.');
      return;
    }

    // Refresh the AuthProvider's profile cache so needsOnboarding flips
    // to false. The root layout then redirects to the app.
    await refreshProfile();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Pick a username</Text>
          <Text style={styles.muted}>
            One more step before you can start sharing ideas. Your username and
            display name appear in every group you join.
          </Text>

          <FormField
            label="Username"
            hint="3–30 chars; lowercase letters, digits, and underscores."
            value={username}
            onChangeText={setUsername}
            error={fieldErrors.username}
          />
          <FormField
            label="Display name"
            hint="What others see in your groups."
            value={displayName}
            onChangeText={setDisplayName}
            error={fieldErrors.displayName}
          />

          {formError ? (
            <View style={styles.alert}>
              <Text style={styles.alertText} accessibilityRole="alert">
                {formError}
              </Text>
            </View>
          ) : null}

          <Button label="Continue" onPress={onSubmit} loading={pending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f6fd' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 14,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  muted: { color: '#64748b', fontSize: 14 },
  alert: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  alertText: { color: '#b91c1c', fontSize: 13 },
});

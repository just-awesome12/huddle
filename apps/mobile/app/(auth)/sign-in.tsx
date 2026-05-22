import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { signInSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setFieldErrors({});
    setFormError(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setPending(false);

    if (error) {
      setFormError(friendlyAuthError(mapSupabaseError(error).message));
      return;
    }
    // The AuthProvider will pick up the session change and the root
    // layout's redirect will fire. No navigation call needed here.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Huddle</Text>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.muted}>Welcome back.</Text>

          <GoogleSignInButton />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.line} />
          </View>

          <FormField
            label="Email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
          />
          <FormField
            label="Password"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
          />

          {formError ? (
            <View style={styles.alert}>
              <Text style={styles.alertText} accessibilityRole="alert">
                {formError}
              </Text>
            </View>
          ) : null}

          <Button label="Sign in" onPress={onSubmit} loading={pending} />

          <Text style={styles.footer}>
            New here?{' '}
            <Link href="/sign-up" style={styles.link}>
              Create an account
            </Link>
            .
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  return message;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  muted: { color: '#64748b', fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerLabel: { color: '#94a3b8', fontSize: 11, letterSpacing: 1.2 },
  alert: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  alertText: { color: '#b91c1c', fontSize: 13 },
  footer: { fontSize: 13, color: '#64748b' },
  link: { color: '#0f172a', fontWeight: '600' },
});

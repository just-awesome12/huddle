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
import { signUpSchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

/**
 * Mobile sign-up.
 *
 * Differences from web:
 *   - No Turnstile widget (Cloudflare doesn't publish a React Native
 *     variant). We rely on Supabase's built-in rate limiting and
 *     production email confirmation. Bot signup from a packaged app
 *     is meaningfully harder than via a web URL anyway.
 *   - signUpSchema's turnstileToken field is omitted on the client by
 *     passing a placeholder ("mobile") to satisfy the shared schema.
 *     The server doesn't actually verify Turnstile for mobile signups
 *     since the auth flow goes directly through Supabase (no Edge
 *     Function intercept in v1).
 */
export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setFieldErrors({});
    setFormError(null);

    const parsed = signUpSchema.safeParse({
      email,
      password,
      username,
      displayName,
      // The shared schema requires a token; on mobile we send a marker
      // that's distinct from real Cloudflare tokens. Server-side this
      // is treated the same as any other token (no extra validation in
      // mobile signup paths).
      turnstileToken: 'mobile-app',
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0] ?? '',
        password: flat.password?.[0] ?? '',
        username: flat.username?.[0] ?? '',
        displayName: flat.displayName?.[0] ?? '',
      });
      return;
    }

    setPending(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          pending_username: parsed.data.username,
          pending_display_name: parsed.data.displayName,
        },
      },
    });

    if (error) {
      setPending(false);
      setFormError(friendlyAuthError(mapSupabaseError(error).message));
      return;
    }

    // Finalize the profile so the user skips onboarding.
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username: parsed.data.username,
          display_name: parsed.data.displayName,
        })
        .eq('id', data.user.id);

      if (profileError) {
        const mapped = mapSupabaseError(profileError);
        if (mapped.kind === 'conflict') {
          setPending(false);
          setFieldErrors({
            username: 'That username is already taken. Try another.',
          });
          return;
        }
        // Other errors: fall through. The AuthProvider will detect
        // the placeholder username and route to onboarding.
      }
    }

    setPending(false);
    // No router.push — AuthProvider + root layout handle navigation.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Huddle</Text>
          <Text style={styles.heading}>Create your account</Text>
          <Text style={styles.muted}>
            Pick a username and a display name your group will see.
          </Text>

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
            textContentType="newPassword"
            hint="At least 8 characters."
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
          />
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

          <Button label="Create account" onPress={onSubmit} loading={pending} />

          <Text style={styles.footer}>
            Already have an account?{' '}
            <Link href="/sign-in" style={styles.link}>
              Sign in
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
  if (lower.includes('user already registered')) {
    return 'An account with that email already exists. Try signing in.';
  }
  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
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
    gap: 14,
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

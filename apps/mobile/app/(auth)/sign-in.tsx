import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Link } from 'expo-router';
import { signInSchema, otpRequestSchema, otpVerifySchema } from '@huddle/validation';
import { mapSupabaseError } from '@huddle/api-client/errors';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

type Method = 'password' | 'otp';
type OtpStep = 'email' | 'code';

export default function SignInScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const [method, setMethod] = useState<Method>('password');
  const [otpStep, setOtpStep] = useState<OtpStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    token?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setFieldErrors({});
    setFormError(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flat.email?.[0], password: flat.password?.[0] });
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

  // Step 1: email a 6-digit code (creates the account if new — D31/D32).
  const onRequestOtp = async () => {
    setFieldErrors({});
    setFormError(null);
    setNotice(null);

    const parsed = otpRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.flatten().fieldErrors.email?.[0] });
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true },
    });
    setPending(false);

    if (error) {
      setFormError(friendlyAuthError(mapSupabaseError(error).message));
      return;
    }
    setOtpStep('code');
    setNotice(`We emailed a 6-digit code to ${parsed.data.email}.`);
  };

  // Step 2: verify the code → AuthProvider picks up the session.
  const onVerifyOtp = async () => {
    setFieldErrors({});
    setFormError(null);

    const parsed = otpVerifySchema.safeParse({ email, token });
    if (!parsed.success) {
      setFieldErrors({ token: parsed.error.flatten().fieldErrors.token?.[0] });
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: 'email',
    });
    setPending(false);

    if (error) {
      const msg = mapSupabaseError(error).message.toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid')) {
        setFieldErrors({ token: 'That code is invalid or has expired. Request a new one.' });
        return;
      }
      setFormError(friendlyAuthError(mapSupabaseError(error).message));
    }
  };

  const switchMethod = (next: Method) => {
    setMethod(next);
    setOtpStep('email');
    setToken('');
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
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

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {method === 'password' ? (
            <>
              <FormField
                label="Email"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
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
            </>
          ) : (
            <>
              <FormField
                label="Email"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                editable={otpStep === 'email'}
                value={email}
                onChangeText={setEmail}
                error={fieldErrors.email}
              />
              {otpStep === 'code' ? (
                <FormField
                  label="6-digit code"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  placeholder="123456"
                  value={token}
                  onChangeText={setToken}
                  error={fieldErrors.token}
                />
              ) : null}
              {formError ? (
                <View style={styles.alert}>
                  <Text style={styles.alertText} accessibilityRole="alert">
                    {formError}
                  </Text>
                </View>
              ) : null}
              {otpStep === 'email' ? (
                <Button label="Email me a code" onPress={onRequestOtp} loading={pending} />
              ) : (
                <>
                  <Button label="Verify & sign in" onPress={onVerifyOtp} loading={pending} />
                  <View style={styles.otpActions}>
                    <Pressable onPress={onRequestOtp} disabled={pending}>
                      <Text style={styles.link}>Resend code</Text>
                    </Pressable>
                    <Pressable onPress={() => switchMethod('otp')}>
                      <Text style={styles.mutedLink}>Use a different email</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}

          <Pressable onPress={() => switchMethod(method === 'password' ? 'otp' : 'password')}>
            <Text style={styles.toggle}>
              {method === 'password'
                ? 'Email me a code instead (no password)'
                : 'Sign in with a password instead'}
            </Text>
          </Pressable>

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
  if (lower.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return message;
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 16,
    },
    title: { fontSize: 24, fontWeight: '700', color: c.text },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    muted: { color: c.muted, fontSize: 14 },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    line: { flex: 1, height: 1, backgroundColor: c.border },
    dividerLabel: { color: c.faint, fontSize: 11, letterSpacing: 1.2 },
    notice: { color: c.muted, fontSize: 13 },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    otpActions: { flexDirection: 'row', justifyContent: 'space-between' },
    toggle: { color: c.muted, fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
    footer: { fontSize: 13, color: c.muted },
    link: { color: c.text, fontWeight: '600' },
    mutedLink: { color: c.muted, textDecorationLine: 'underline', fontSize: 13 },
  });

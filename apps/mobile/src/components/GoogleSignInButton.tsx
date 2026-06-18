import { useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

/**
 * Google sign-in button for mobile.
 *
 * Flow:
 *   1. Build a deep-link callback URL: huddle://auth-callback
 *   2. Call supabase.auth.signInWithOAuth({ provider: 'google', redirectTo })
 *      → Supabase returns Google's authorization URL
 *   3. Open that URL in the system browser via WebBrowser.openAuthSessionAsync
 *      → Returns when the browser is redirected to our callback URL
 *   4. Parse the access_token + refresh_token from the URL fragment
 *   5. Pass them to supabase.auth.setSession() to establish the session
 *   6. The AuthProvider picks up the change and the root layout navigates
 *
 * The deep link `huddle://auth-callback` requires the app's scheme to be
 * registered. In app.json the scheme is set to "huddle".
 *
 * IMPORTANT: This file completes the auth-session whenever the module
 * loads. WebBrowser.maybeCompleteAuthSession() must be called as a
 * top-level side-effect in the file that owns OAuth — otherwise the
 * browser stays open after the redirect on some platforms.
 */

WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton() {
  const c = useColors();
  const styles = makeStyles(c);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setError(null);
    setPending(true);

    try {
      // Deep link the system browser will redirect to once Google
      // completes. Expo Linking.createURL builds a URL using the app's
      // configured scheme (set in app.json).
      const redirectTo = Linking.createURL('/auth-callback');

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true, // we open the browser ourselves
        },
      });

      if (oauthError || !data.url) {
        throw new Error(oauthError?.message ?? 'Could not start Google sign-in.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        // User cancelled, dismissed, or browser closed without completing.
        if (result.type === 'cancel' || result.type === 'dismiss') {
          // Quietly drop — cancellation isn't an error worth surfacing.
          return;
        }
        throw new Error('Google sign-in did not complete.');
      }

      // The redirect URL contains the access_token and refresh_token
      // in the URL fragment (#access_token=...&refresh_token=...).
      // Linking.parse expects them as a fragment, but Supabase sometimes
      // returns them as a query string. Try both.
      const url = result.url;
      const fragmentStart = url.indexOf('#');
      const queryStart = url.indexOf('?');
      const paramString =
        fragmentStart !== -1
          ? url.substring(fragmentStart + 1)
          : queryStart !== -1
            ? url.substring(queryStart + 1)
            : '';

      const params = new URLSearchParams(paramString);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        throw new Error('No tokens returned from Google sign-in.');
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        throw new Error(setSessionError.message);
      }

      // AuthProvider picks up the new session via onAuthStateChange.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        disabled={pending}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          pressed && !pending && styles.buttonPressed,
          pending && styles.buttonDisabled,
        ]}
      >
        {pending ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.label}>Continue with Google</Text>
        )}
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    button: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    buttonPressed: { backgroundColor: c.surface2 },
    buttonDisabled: { opacity: 0.6 },
    label: { fontSize: 14, fontWeight: '600', color: c.text },
    error: { fontSize: 12, color: c.danger },
  });

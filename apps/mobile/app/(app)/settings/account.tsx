import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useDeleteAccount, SoleAdminError } from '@huddle/api-client/account-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { ConfirmAction } from '@/components/ConfirmAction';

export default function AccountScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();
  const deleteAccount = useDeleteAccount(supabase);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        // Account is gone server-side; clear the local session → the
        // GatedStack sends us back to the auth flow.
        void supabase.auth.signOut();
      },
      onError: (e) => {
        if (e instanceof SoleAdminError) {
          const names = e.groups.map((g) => g.name).join(', ');
          setError(
            `You're the only admin of: ${names}. Promote another member, or delete ${
              e.groups.length === 1 ? 'that group' : 'those groups'
            } first.`,
          );
        } else {
          setError('Could not delete your account. Please try again.');
        }
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Account</Text>

        <View style={styles.danger}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerBody}>
            This permanently deletes your account and removes your personal information. Ideas and
            picks you contributed stay in your groups but are no longer attributed to you. If
            you&rsquo;re the only admin of a group with other members, you&rsquo;ll need to hand it
            off first. This can&rsquo;t be undone.
          </Text>
          <View style={styles.actionRow}>
            <ConfirmAction
              buttonLabel="Delete my account"
              confirmPrompt="Permanently delete your account? This cannot be undone."
              confirmLabel="Delete account"
              variant="secondary"
              pending={deleteAccount.isPending}
              error={error}
              onConfirm={onConfirm}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    scroll: { padding: 16, gap: 12 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    danger: {
      borderWidth: 1,
      borderColor: c.danger,
      backgroundColor: c.dangerBg,
      borderRadius: 12,
      padding: 16,
      gap: 8,
    },
    dangerTitle: { fontSize: 15, fontWeight: '700', color: c.dangerText },
    dangerBody: { fontSize: 13, color: c.dangerText, lineHeight: 19 },
    actionRow: { marginTop: 4 },
  });

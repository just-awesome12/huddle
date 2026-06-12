import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { acceptInviteSchema } from '@huddle/validation';
import {
  usePeekInvite,
  useAcceptInvite,
  inviteErrorKind,
} from '@huddle/api-client/invites-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

function inviteErrorMessage(e: unknown): string {
  switch (inviteErrorKind(e)) {
    case 'not_found':
      return 'That invite link is not valid.';
    case 'expired':
      return 'This invite has expired. Ask for a new one.';
    case 'already_used':
      return 'This invite has already been used. Ask for a new one.';
    case 'wrong_user':
      return 'This invite was sent to a different account. Check that you are signed in with the right one.';
    case 'already_member':
      return "You're already a member of this group.";
    default:
      return 'Could not accept the invite. Please try again.';
  }
}

function StatusCard({
  title,
  body,
  onHome,
}: {
  title: string;
  body: string;
  onHome: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.card}>
        <Text style={styles.heading} testID="invite-status">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
        <Button label="Go to your groups" variant="secondary" onPress={onHome} />
      </View>
    </View>
  );
}

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const accept = useAcceptInvite(supabase);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const tokenParse = acceptInviteSchema.safeParse({ token });
  const peek = usePeekInvite(supabase, tokenParse.success ? tokenParse.data.token : '', {
    enabled: tokenParse.success,
  });

  const goHome = () => router.replace('/groups');

  if (!tokenParse.success) {
    return (
      <StatusCard
        title="Invalid invite link"
        body="This link doesn't look like a Huddle invite. Check that the full link was copied."
        onHome={goHome}
      />
    );
  }

  if (peek.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  if (peek.isError) {
    return (
      <StatusCard
        title={inviteErrorKind(peek.error) === 'not_found' ? 'Invite not found' : 'Something went wrong'}
        body={
          inviteErrorKind(peek.error) === 'not_found'
            ? "This invite doesn't exist — it may have been revoked. Ask for a new link."
            : 'Could not load the invite. Please try again.'
        }
        onHome={goHome}
      />
    );
  }

  switch (peek.data.status) {
    case 'expired':
      return (
        <StatusCard
          title="Invite expired"
          body={`The invite to "${peek.data.group_name}" has expired. Ask ${peek.data.inviter_display_name} for a new one.`}
          onHome={goHome}
        />
      );
    case 'accepted':
      return (
        <StatusCard
          title="Invite already used"
          body={`This invite to "${peek.data.group_name}" has already been used. Ask ${peek.data.inviter_display_name} for a new one.`}
          onHome={goHome}
        />
      );
    case 'already_member':
      return (
        <StatusCard
          title="You're already in"
          body={`You're already a member of "${peek.data.group_name}".`}
          onHome={goHome}
        />
      );
    case 'wrong_user':
      return (
        <StatusCard
          title="Wrong account"
          body="This invite was sent to a different account. Check that you're signed in with the right one."
          onHome={goHome}
        />
      );
  }

  return (
    <View style={styles.center}>
      <View style={styles.card}>
        <Text style={styles.kicker}>You&apos;ve been invited</Text>
        <Text style={styles.groupName} testID="invite-group-name">
          {peek.data.group_name}
        </Text>
        <Text style={styles.body}>Invited by {peek.data.inviter_display_name}</Text>
        {acceptError ? (
          <View style={styles.alert}>
            <Text style={styles.alertText} accessibilityRole="alert">
              {acceptError}
            </Text>
          </View>
        ) : null}
        <Button
          label="Accept invite"
          loading={accept.isPending}
          onPress={() => {
            setAcceptError(null);
            accept.mutate(tokenParse.data.token, {
              onSuccess: (group) => router.replace(`/groups/${group.id}`),
              onError: (e) => setAcceptError(inviteErrorMessage(e)),
            });
          }}
        />
        <Button label="Not now" variant="ghost" onPress={goHome} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 10,
  },
  kicker: { fontSize: 13, color: '#64748b' },
  groupName: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  body: { fontSize: 14, color: '#475569', lineHeight: 20 },
  alert: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  alertText: { color: '#b91c1c', fontSize: 13 },
});

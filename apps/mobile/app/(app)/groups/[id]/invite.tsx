import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { createInviteSchema } from '@huddle/validation';
import {
  useGroup,
  useGroupMembers,
} from '@huddle/api-client/groups-hooks';
import {
  useGroupInvites,
  useCreateInvite,
  useRevokeInvite,
  type GroupInviteRow,
} from '@huddle/api-client/invites-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { inviteWebUrl } from '@/lib/invite-url';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ConfirmAction } from '@/components/ConfirmAction';

function describeInvite(invite: GroupInviteRow): string {
  if (invite.invited_email) return `For ${invite.invited_email}`;
  if (invite.invited_user_id) return 'For a specific user';
  return 'Open link';
}

export default function GroupInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const invites = useGroupInvites(supabase, id);
  const createInvite = useCreateInvite(supabase);
  const revokeInvite = useRevokeInvite(supabase, id);

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (group.isPending || members.isPending || invites.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  if (group.isError || members.isError || invites.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Group not found</Text>
        <Button
          label="Back to groups"
          variant="secondary"
          onPress={() => router.replace('/groups')}
        />
      </View>
    );
  }

  // Invites are admin-only (RLS enforces; this is UX).
  const myMembership = members.data.find((m) => m.userId === myUserId);
  if (myMembership?.role !== 'admin') {
    return <Redirect href={`/groups/${id}`} />;
  }

  const onGenerate = () => {
    setFieldError(undefined);
    setFormError(null);
    setCreatedToken(null);

    const parsed = createInviteSchema.safeParse({
      groupId: id,
      invitedEmail: email.trim() === '' ? undefined : email,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.invitedEmail?.[0]);
      return;
    }

    createInvite.mutate(
      { groupId: id, invitedEmail: parsed.data.invitedEmail },
      {
        onSuccess: (invite) => setCreatedToken(invite.token),
        onError: () =>
          setFormError('Could not create the invite. Please try again.'),
      },
    );
  };

  const inviteUrl = createdToken ? inviteWebUrl(createdToken) : null;

  const copy = async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({ message: `Join "${group.data.name}" on Huddle: ${inviteUrl}` });
    } catch {
      // Share sheet unavailable (e.g. web preview without navigator.share)
      // — Copy is right next to it.
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button
          label={`← ${group.data.name}`}
          variant="ghost"
          onPress={() => router.replace(`/groups/${id}`)}
        />
      </View>

      <FlatList
        data={invites.data}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.heading}>Invite people</Text>

            <View style={styles.card}>
              <FormField
                label="Email (optional)"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                hint="Leave empty for an open link anyone can use. With an email, only that account can accept."
                error={fieldError}
              />
              {formError ? (
                <View style={styles.alert}>
                  <Text style={styles.alertText} accessibilityRole="alert">
                    {formError}
                  </Text>
                </View>
              ) : null}
              <Button
                label="Generate invite link"
                onPress={onGenerate}
                loading={createInvite.isPending}
              />

              {inviteUrl ? (
                <View style={styles.linkBlock}>
                  <Text style={styles.linkLabel}>Invite link — valid for 7 days</Text>
                  <Text style={styles.linkUrl} selectable testID="invite-url">
                    {inviteUrl}
                  </Text>
                  <View style={styles.qrWrap}>
                    <QRCode value={inviteUrl} size={140} />
                  </View>
                  <View style={styles.row}>
                    <Button
                      label={copied ? 'Copied!' : 'Copy link'}
                      variant="secondary"
                      onPress={copy}
                    />
                    <Button label="Share…" variant="secondary" onPress={share} />
                  </View>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>
              Open invites ({invites.data.length})
            </Text>
            {invites.data.length === 0 ? (
              <Text style={styles.muted}>
                No open invites. Generate a link above to invite someone.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const expired = new Date(item.expires_at).getTime() < Date.now();
          return (
            <View style={styles.inviteRow}>
              <View style={styles.inviteInfo}>
                <Text style={styles.inviteKind}>{describeInvite(item)}</Text>
                <Text style={[styles.inviteMeta, expired && styles.expired]}>
                  {expired
                    ? 'Expired'
                    : `Expires ${new Date(item.expires_at).toLocaleDateString()}`}
                  {' · '}…{item.token.slice(-6)}
                </Text>
              </View>
              <ConfirmAction
                buttonLabel="Revoke"
                confirmPrompt="Revoke this invite? The link will stop working."
                confirmLabel="Revoke invite"
                variant="secondary"
                pending={revokeInvite.isPending}
                error={revokeInvite.isError ? 'Could not revoke the invite.' : null}
                onConfirm={() => revokeInvite.mutate(item.id)}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  scroll: { padding: 16, gap: 8 },
  headerBlock: { gap: 16, marginBottom: 8 },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 12,
  },
  alert: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  alertText: { color: '#b91c1c', fontSize: 13 },
  linkBlock: {
    marginTop: 4,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
  },
  linkLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  linkUrl: { fontSize: 12, color: '#0f172a' },
  qrWrap: { alignItems: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  muted: { fontSize: 13, color: '#64748b' },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inviteInfo: { flexShrink: 1 },
  inviteKind: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  inviteMeta: { fontSize: 12, color: '#64748b' },
  expired: { color: '#dc2626' },
});

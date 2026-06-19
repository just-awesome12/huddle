import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { createInviteSchema } from '@huddle/validation';
import { useGroup, useGroupMembers } from '@huddle/api-client/groups-hooks';
import {
  useGroupInvites,
  useCreateInvite,
  useRevokeInvite,
  type GroupInviteWithInvitee,
} from '@huddle/api-client/invites-hooks';
import { useSearchProfiles } from '@huddle/api-client/profiles-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { inviteWebUrl } from '@/lib/invite-url';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ConfirmAction } from '@/components/ConfirmAction';

function describeInvite(invite: GroupInviteWithInvitee): string {
  if (invite.invited_email) return `For ${invite.invited_email}`;
  if (invite.invited_profile) return `For @${invite.invited_profile.username}`;
  if (invite.invited_user_id) return 'For a specific user';
  return 'Open link';
}

const SEARCH_QUERY_RE = /^[a-z0-9_]{1,30}$/;

export default function GroupInviteScreen() {
  const c = useColors();
  const styles = makeStyles(c);
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

  // Add-by-username search (debounced; queries Supabase directly —
  // the perimeter rate limit for this path lands in Phase 9).
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [invitedIds, setInvitedIds] = useState<Record<string, boolean>>({});
  const [searchInviteError, setSearchInviteError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchEnabled = SEARCH_QUERY_RE.test(searchQuery);
  const search = useSearchProfiles(supabase, searchQuery, {
    enabled: searchEnabled,
  });

  if (group.isPending || members.isPending || invites.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.brand[600]} />
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
        onError: () => setFormError('Could not create the invite. Please try again.'),
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

            <View style={styles.card}>
              <FormField
                label="Add by username"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Start typing a username…"
                value={searchInput}
                onChangeText={setSearchInput}
                hint="Invites the person directly — only their account can accept."
              />
              {searchInviteError ? (
                <View style={styles.alert}>
                  <Text style={styles.alertText} accessibilityRole="alert">
                    {searchInviteError}
                  </Text>
                </View>
              ) : null}
              {searchEnabled && search.isSuccess && search.data.length === 0 ? (
                <Text style={styles.muted}>No matching usernames.</Text>
              ) : null}
              {searchEnabled && search.isSuccess
                ? search.data.map((profile) => (
                    <View key={profile.id} style={styles.resultRow}>
                      <View style={styles.inviteInfo}>
                        <Text style={styles.inviteKind}>{profile.display_name}</Text>
                        <Text style={styles.inviteMeta}>@{profile.username}</Text>
                      </View>
                      {invitedIds[profile.id] ? (
                        <Text style={styles.invitedMark}>Invited ✓</Text>
                      ) : (
                        <Button
                          label="Invite"
                          variant="secondary"
                          loading={createInvite.isPending}
                          onPress={() => {
                            setSearchInviteError(null);
                            createInvite.mutate(
                              { groupId: id, invitedUserId: profile.id },
                              {
                                onSuccess: () =>
                                  setInvitedIds((prev) => ({ ...prev, [profile.id]: true })),
                                onError: (e) =>
                                  setSearchInviteError(
                                    /already a member/i.test(e.message)
                                      ? `@${profile.username} is already a member.`
                                      : 'Could not create the invite. Please try again.',
                                  ),
                              },
                            );
                          }}
                        />
                      )}
                    </View>
                  ))
                : null}
            </View>

            <Text style={styles.sectionTitle}>Open invites ({invites.data.length})</Text>
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: c.canvas,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    scroll: { padding: 16, gap: 8 },
    headerBlock: { gap: 16, marginBottom: 8 },
    heading: { fontSize: 18, fontWeight: '600', color: c.text },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 12,
    },
    alert: { backgroundColor: c.dangerBg, padding: 10, borderRadius: 8 },
    alertText: { color: c.dangerText, fontSize: 13 },
    linkBlock: {
      marginTop: 4,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    linkLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    linkUrl: { fontSize: 12, color: c.text },
    qrWrap: { alignItems: 'center', paddingVertical: 8 },
    row: { flexDirection: 'row', gap: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.muted,
    },
    muted: { fontSize: 13, color: c.muted },
    inviteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inviteInfo: { flexShrink: 1 },
    inviteKind: { fontSize: 14, fontWeight: '600', color: c.text },
    inviteMeta: { fontSize: 12, color: c.muted },
    expired: { color: c.danger },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.surface2,
      paddingTop: 10,
    },
    invitedMark: { fontSize: 13, fontWeight: '600', color: '#15803d' },
  });

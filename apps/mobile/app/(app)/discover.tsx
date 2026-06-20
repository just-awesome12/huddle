import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import {
  useSearchPublicGroups,
  useMyGroups,
  useMyJoinRequests,
  useRequestToJoin,
  useWithdrawJoinRequest,
  type GroupSearchParams,
} from '@huddle/api-client/groups-hooks';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';

export default function DiscoverScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const router = useRouter();

  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [applied, setApplied] = useState<GroupSearchParams>({});

  const results = useSearchPublicGroups(supabase, applied);
  const myGroups = useMyGroups(supabase);
  const myRequests = useMyJoinRequests(supabase);
  const requestToJoin = useRequestToJoin(supabase);
  const withdraw = useWithdrawJoinRequest(supabase);

  const memberIds = useMemo(() => new Set((myGroups.data ?? []).map((g) => g.id)), [myGroups.data]);
  const pendingByGroup = useMemo(
    () => new Map((myRequests.data ?? []).map((r) => [r.group_id, r.id])),
    [myRequests.data],
  );

  const onSearch = () => {
    setApplied({
      q: q.trim(),
      location: location.trim(),
      tags: tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button label="← Groups" variant="ghost" onPress={() => router.replace('/groups')} />
        <Text style={styles.title}>Discover</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchBlock}>
        <FormField label="Search" value={q} onChangeText={setQ} placeholder="Tacos, hiking…" />
        <FormField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="Austin, TX"
          autoCapitalize="words"
        />
        <FormField label="Tags" value={tagsInput} onChangeText={setTagsInput} placeholder="food" />
        <Button label="Search" onPress={onSearch} loading={results.isFetching} />
      </View>

      {results.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand[600]} />
        </View>
      ) : results.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn&apos;t load groups.</Text>
        </View>
      ) : results.data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No public groups match your search yet.</Text>
        </View>
      ) : (
        <FlatList
          data={results.data}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={results.isRefetching} onRefresh={() => results.refetch()} />
          }
          renderItem={({ item }) => {
            const isMember = memberIds.has(item.id);
            const pendingId = pendingByGroup.get(item.id);
            return (
              <View style={styles.card}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
                  {item.location ? ` · ${item.location}` : ''}
                </Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.tags.length > 0 ? (
                  <View style={styles.tagsRow}>
                    {item.tags.slice(0, 4).map((t) => (
                      <Text key={t} style={styles.tag}>
                        #{t}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={styles.cardAction}>
                  {isMember ? (
                    <Button
                      label="Open"
                      variant="secondary"
                      onPress={() => router.push(`/groups/${item.id}`)}
                    />
                  ) : pendingId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => withdraw.mutate(pendingId)}
                    >
                      <Text style={styles.requested}>Requested · Cancel</Text>
                    </Pressable>
                  ) : (
                    <Button
                      label="Request to join"
                      loading={requestToJoin.isPending}
                      onPress={() => requestToJoin.mutate({ groupId: item.id })}
                    />
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    searchBlock: {
      padding: 16,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    muted: { color: c.muted, fontSize: 13, textAlign: 'center' },
    list: { padding: 16, gap: 12 },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
      gap: 6,
    },
    cardName: { fontSize: 16, fontWeight: '700', color: c.text },
    desc: { fontSize: 13, color: c.muted },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    tag: {
      fontSize: 12,
      color: c.muted,
      backgroundColor: c.surface2,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    cardAction: { marginTop: 6, alignItems: 'flex-start' },
    requested: { fontSize: 14, fontWeight: '600', color: c.muted, paddingVertical: 8 },
  });

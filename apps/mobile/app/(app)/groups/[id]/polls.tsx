import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createPollSchema } from '@huddle/validation';
import { useGroup } from '@huddle/api-client/groups-hooks';
import {
  useGroupPolls,
  useCreatePoll,
  useCastVote,
  useSetPollClosed,
  useDeletePoll,
  type PollWithResults,
} from '@huddle/api-client/polls-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useGroupRealtime } from '@/context/RealtimeContext';
import { Button } from '@/components/Button';

export default function PollsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id ?? '';

  useGroupRealtime(id);

  const group = useGroup(supabase, id);
  const polls = useGroupPolls(supabase, id, myUserId);
  const createPoll = useCreatePoll(supabase, id);
  const castVote = useCastVote(supabase, id);
  const setClosed = useSetPollClosed(supabase, id);
  const deletePoll = useDeletePoll(supabase, id);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const onCreate = () => {
    setError(null);
    const parsed = createPollSchema.safeParse({
      groupId: id,
      question,
      options: options.map((o) => o.trim()).filter((o) => o.length > 0),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Could not create the poll.');
      return;
    }
    createPoll.mutate(
      { question: parsed.data.question, options: parsed.data.options },
      {
        onSuccess: () => {
          setQuestion('');
          setOptions(['', '']);
        },
        onError: () => setError('Could not create the poll. Please try again.'),
      },
    );
  };

  const renderPoll = (poll: PollWithResults) => {
    const canManage = poll.createdBy === myUserId; // admin-delete also allowed by RLS
    const closed = poll.closedAt !== null;
    const lead = Math.max(0, ...poll.options.map((o) => o.count));
    return (
      <View key={poll.id} style={styles.poll}>
        <View style={styles.pollHead}>
          <Text style={styles.question}>{poll.question}</Text>
          {closed ? <Text style={styles.closedTag}>CLOSED</Text> : null}
        </View>
        {poll.options.map((opt) => {
          const mine = poll.myOptionId === opt.id;
          const pct = poll.totalVotes > 0 ? Math.round((opt.count / poll.totalVotes) * 100) : 0;
          const leading = opt.count > 0 && opt.count === lead;
          return (
            <Pressable
              key={opt.id}
              disabled={closed}
              accessibilityRole="button"
              accessibilityLabel={`Vote ${opt.label}`}
              onPress={() => castVote.mutate({ pollId: poll.id, optionId: opt.id })}
              style={[styles.option, mine && styles.optionMine]}
            >
              <View
                style={[styles.optionBar, { width: `${pct}%` }, leading && styles.optionBarLead]}
              />
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel} numberOfLines={1}>
                  {mine ? '✓ ' : ''}
                  {opt.label}
                </Text>
                <Text style={styles.optionCount}>
                  {opt.count} · {pct}%
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={styles.pollFoot}>
          <Text style={styles.mutedText}>
            {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
          </Text>
          {canManage ? (
            <>
              <Pressable onPress={() => setClosed.mutate({ pollId: poll.id, closed: !closed })}>
                <Text style={styles.action}>{closed ? 'Reopen' : 'Close'}</Text>
              </Pressable>
              <Pressable onPress={() => deletePoll.mutate(poll.id)}>
                <Text style={[styles.action, styles.danger]}>Delete</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Button
          label={`← ${group.data?.name ?? 'Back'}`}
          variant="ghost"
          onPress={() => router.replace(`/groups/${id}`)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Polls</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Ask the group</Text>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Which weekend works?"
            placeholderTextColor={c.faint}
            maxLength={200}
            style={styles.input}
          />
          {options.map((opt, i) => (
            <TextInput
              key={i}
              value={opt}
              onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={c.faint}
              maxLength={100}
              style={styles.input}
            />
          ))}
          {options.length < 10 ? (
            <Pressable onPress={() => setOptions((prev) => [...prev, ''])}>
              <Text style={styles.action}>+ Add option</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.danger}>{error}</Text> : null}
          <Button label="Create poll" onPress={onCreate} loading={createPoll.isPending} />
        </View>

        {polls.isPending ? (
          <ActivityIndicator color={c.brand[600]} />
        ) : polls.data && polls.data.length > 0 ? (
          polls.data.map(renderPoll)
        ) : (
          <Text style={styles.mutedText}>No polls yet. Ask the group something above.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    header: { paddingHorizontal: 8, paddingTop: 8 },
    scroll: { padding: 16, gap: 16 },
    heading: { fontSize: 20, fontWeight: '700', color: c.text },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 10,
    },
    label: { fontSize: 13, fontWeight: '600', color: c.text },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.surface,
    },
    poll: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 8,
    },
    pollHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    question: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
    closedTag: { fontSize: 10, fontWeight: '800', color: c.muted },
    option: {
      position: 'relative',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    optionMine: { borderColor: c.brand[600], backgroundColor: c.brand[50] },
    optionBar: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: c.surface2 },
    optionBarLead: { backgroundColor: c.brand[100] },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    optionLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },
    optionCount: { fontSize: 12, color: c.muted },
    pollFoot: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
    mutedText: { fontSize: 13, color: c.muted },
    action: { fontSize: 13, fontWeight: '600', color: c.brand[600] },
    danger: { color: c.danger },
  });

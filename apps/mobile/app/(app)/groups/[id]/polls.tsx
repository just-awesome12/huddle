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
import { createPollSchema, createAvailabilityPollSchema } from '@huddle/validation';
import { useGroup } from '@huddle/api-client/groups-hooks';
import {
  useGroupPolls,
  useCreatePoll,
  useCastVote,
  useSetPollClosed,
  useDeletePoll,
  type PollWithResults,
} from '@huddle/api-client/polls-hooks';
import {
  useGroupAvailabilityPolls,
  useCreateAvailabilityPoll,
  useSetAvailability,
  useSetAvailabilityClosed,
  useDeleteAvailabilityPoll,
  type AvailabilityPollWithResults,
  type AvailabilityStatus,
} from '@huddle/api-client/availability-hooks';
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

  const availPolls = useGroupAvailabilityPolls(supabase, id, myUserId);
  const createAvail = useCreateAvailabilityPoll(supabase, id);
  const setAvail = useSetAvailability(supabase, id);
  const setAvailClosed = useSetAvailabilityClosed(supabase, id);
  const deleteAvail = useDeleteAvailabilityPoll(supabase, id);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const [availTitle, setAvailTitle] = useState('');
  const [availDates, setAvailDates] = useState(['', '']);
  const [availError, setAvailError] = useState<string | null>(null);

  const onCreateAvail = () => {
    setAvailError(null);
    const parsed = createAvailabilityPollSchema.safeParse({
      groupId: id,
      title: availTitle,
      dates: availDates.map((d) => d.trim()).filter((d) => d.length > 0),
    });
    if (!parsed.success) {
      setAvailError(parsed.error.issues[0]?.message ?? 'Could not create the poll.');
      return;
    }
    createAvail.mutate(
      { title: parsed.data.title, dates: parsed.data.dates },
      {
        onSuccess: () => {
          setAvailTitle('');
          setAvailDates(['', '']);
        },
        onError: () => setAvailError('Could not create the poll. Please try again.'),
      },
    );
  };

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

  const STATUSES: AvailabilityStatus[] = ['yes', 'maybe', 'no'];
  const statusSymbol = (s: AvailabilityStatus) => (s === 'yes' ? '✓' : s === 'maybe' ? '~' : '✗');

  const renderAvailPoll = (poll: AvailabilityPollWithResults) => {
    const canManage = poll.createdBy === myUserId;
    const closed = poll.closedAt !== null;
    const bestYes = Math.max(0, ...poll.dates.map((d) => d.yes));
    return (
      <View key={poll.id} style={styles.poll}>
        <View style={styles.pollHead}>
          <Text style={styles.question}>{poll.title}</Text>
          {closed ? <Text style={styles.closedTag}>CLOSED</Text> : null}
        </View>
        {poll.dates.map((d) => {
          const best = d.yes > 0 && d.yes === bestYes;
          return (
            <View key={d.id} style={[styles.availRow, best && styles.availRowBest]}>
              <Text style={styles.availDate}>{d.date}</Text>
              <Text style={styles.availTally}>
                ✓ {d.yes} · ~ {d.maybe} · ✗ {d.no}
              </Text>
              {!closed ? (
                <View style={styles.availBtns}>
                  {STATUSES.map((s) => (
                    <Pressable
                      key={s}
                      accessibilityLabel={`${s} for ${d.date}`}
                      onPress={() => setAvail.mutate({ pollId: poll.id, dateId: d.id, status: s })}
                      style={[styles.availBtn, d.myStatus === s && styles.availBtnOn]}
                    >
                      <Text
                        style={[styles.availBtnText, d.myStatus === s && styles.availBtnTextOn]}
                      >
                        {statusSymbol(s)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={styles.pollFoot}>
          <Text style={styles.mutedText}>
            {poll.respondentCount} {poll.respondentCount === 1 ? 'person' : 'people'} answered
          </Text>
          {canManage ? (
            <>
              <Pressable
                onPress={() => setAvailClosed.mutate({ pollId: poll.id, closed: !closed })}
              >
                <Text style={styles.action}>{closed ? 'Reopen' : 'Close'}</Text>
              </Pressable>
              <Pressable onPress={() => deleteAvail.mutate(poll.id)}>
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

        <Text style={styles.heading}>When&rsquo;s free?</Text>
        <View style={styles.card}>
          <Text style={styles.label}>What are we planning?</Text>
          <TextInput
            value={availTitle}
            onChangeText={setAvailTitle}
            placeholder="Dinner next week"
            placeholderTextColor={c.faint}
            maxLength={200}
            style={styles.input}
          />
          {availDates.map((d, i) => (
            <TextInput
              key={i}
              value={d}
              onChangeText={(t) => setAvailDates((prev) => prev.map((o, j) => (j === i ? t : o)))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              maxLength={10}
              style={styles.input}
            />
          ))}
          {availDates.length < 14 ? (
            <Pressable onPress={() => setAvailDates((prev) => [...prev, ''])}>
              <Text style={styles.action}>+ Add date</Text>
            </Pressable>
          ) : null}
          {availError ? <Text style={styles.danger}>{availError}</Text> : null}
          <Button label="Ask when's free" onPress={onCreateAvail} loading={createAvail.isPending} />
        </View>

        {availPolls.isPending ? (
          <ActivityIndicator color={c.brand[600]} />
        ) : availPolls.data && availPolls.data.length > 0 ? (
          availPolls.data.map(renderAvailPoll)
        ) : (
          <Text style={styles.mutedText}>No date polls yet.</Text>
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
    availRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    availRowBest: { borderColor: c.brand[300], backgroundColor: c.brand[50] },
    availDate: { fontSize: 14, fontWeight: '600', color: c.text, minWidth: 96 },
    availTally: { fontSize: 12, color: c.muted },
    availBtns: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
    availBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    availBtnOn: { backgroundColor: c.brand[600], borderColor: c.brand[600] },
    availBtnText: { fontSize: 13, fontWeight: '700', color: c.muted },
    availBtnTextOn: { color: '#fff' },
  });

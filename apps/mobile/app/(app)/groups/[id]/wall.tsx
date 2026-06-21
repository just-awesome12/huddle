import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { postBodySchema } from '@huddle/validation';
import { useGroup, useGroupMembers } from '@huddle/api-client/groups-hooks';
import {
  useGroupPosts,
  useAddGroupPost,
  useDeleteGroupPost,
  type PostWithAuthor,
} from '@huddle/api-client/posts-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function GroupWallScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const group = useGroup(supabase, id);
  const members = useGroupMembers(supabase, id);
  const posts = useGroupPosts(supabase, id);
  const addPost = useAddGroupPost(supabase, id);
  const deletePost = useDeleteGroupPost(supabase, id);

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isAdmin = members.data?.find((m) => m.userId === myUserId)?.role === 'admin';

  const onPost = () => {
    setError(null);
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Post cannot be empty');
      return;
    }
    addPost.mutate(parsed.data, {
      onSuccess: () => setBody(''),
      onError: () => setError('Could not post. Please try again.'),
    });
  };

  const renderItem = ({ item }: { item: PostWithAuthor }) => {
    const name = item.author?.display_name ?? 'Former member';
    const canDelete = item.author?.id === myUserId || isAdmin;
    return (
      <View style={styles.post}>
        <View style={styles.postHead}>
          <Text style={styles.author}>{name}</Text>
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete post"
              onPress={() => deletePost.mutate(item.id)}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.body}>{item.body}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerBar}>
        <Button
          label={`← ${group.data?.name ?? 'Back'}`}
          variant="ghost"
          onPress={() => router.replace(`/groups/${id}`)}
        />
      </View>

      <View style={styles.composer}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Anyone free this weekend?"
          placeholderTextColor={c.muted}
          multiline
          maxLength={2000}
          style={styles.input}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label="Post" onPress={onPost} loading={addPost.isPending} />
      </View>

      {posts.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand[600]} />
        </View>
      ) : (
        <FlatList
          data={posts.data ?? []}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No posts yet. Start the conversation.</Text>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.canvas },
    center: { paddingVertical: 32, alignItems: 'center' },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    composer: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    input: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      backgroundColor: c.surface,
      textAlignVertical: 'top',
    },
    error: { color: c.dangerText, fontSize: 13 },
    list: { padding: 12, gap: 10 },
    post: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    postHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    author: { fontSize: 14, fontWeight: '700', color: c.text },
    time: { fontSize: 12, color: c.muted },
    deleteBtn: { marginLeft: 'auto' },
    deleteText: { fontSize: 12, color: c.muted, fontWeight: '600' },
    body: { marginTop: 6, fontSize: 14, color: c.text },
    empty: { textAlign: 'center', color: c.muted, fontSize: 14, paddingVertical: 32 },
  });

import { StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';

export default function HomeScreen() {
  const { session } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Huddle</Text>
        <Button label="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} />
      </View>
      <View style={styles.body}>
        <Text style={styles.heading}>You&apos;re signed in.</Text>
        <Text style={styles.muted}>{session?.user.email}</Text>
        <Text style={styles.body_text}>
          Phases 3 onward will replace this placeholder with the real group and
          ideas UI. For now, this screen confirms that authentication works
          end-to-end on mobile.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  body: { padding: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  muted: { fontSize: 14, color: '#64748b' },
  body_text: { fontSize: 14, color: '#334155', lineHeight: 20 },
});

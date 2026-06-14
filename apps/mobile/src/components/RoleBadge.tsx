import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

interface RoleBadgeProps {
  role: 'admin' | 'member';
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.badge, isAdmin ? styles.admin : styles.member]}>
      <Text style={[styles.label, isAdmin ? styles.adminLabel : styles.memberLabel]}>
        {isAdmin ? 'Admin' : 'Member'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  admin: { backgroundColor: colors.brand[600] },
  member: { backgroundColor: '#f1f5f9' },
  label: { fontSize: 11, fontWeight: '600' },
  adminLabel: { color: '#fff' },
  memberLabel: { color: '#475569' },
});

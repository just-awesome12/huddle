import { StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '@/context/ThemeContext';

interface RoleBadgeProps {
  role: 'admin' | 'member';
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.badge, isAdmin ? styles.admin : styles.member]}>
      <Text style={[styles.label, isAdmin ? styles.adminLabel : styles.memberLabel]}>
        {isAdmin ? 'Admin' : 'Member'}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  admin: { backgroundColor: c.brand[600] },
  member: { backgroundColor: c.surface2 },
  label: { fontSize: 11, fontWeight: '600' },
  adminLabel: { color: c.surface },
  memberLabel: { color: c.muted },
});

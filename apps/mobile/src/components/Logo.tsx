import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/lib/theme';

/**
 * Huddle logo: three overlapping circles (a "huddle") + wordmark.
 * Brand violet/pink (Pop direction, OQ-4).
 */
export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <View style={styles.row}>
      <Svg width={24} height={24} viewBox="0 0 34 34">
        <Circle cx={12} cy={13} r={7} fill={colors.brand[600]} />
        <Circle cx={22} cy={13} r={7} fill={colors.accent[400]} />
        <Circle cx={17} cy={22} r={7} fill={colors.brand[400]} />
      </Svg>
      {wordmark ? <Text style={styles.word}>Huddle</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontSize: 20, fontWeight: '700', color: colors.brand[900] },
});

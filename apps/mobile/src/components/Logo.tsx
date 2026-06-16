import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/context/ThemeContext';

/**
 * Huddle logo: brand mark PNG (works on light + dark) + the "HUDDLE"
 * wordmark in theme-coloured text. Mark-only via `wordmark={false}`.
 */
export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={styles.mark}
        resizeMode="contain"
        accessibilityLabel="Huddle"
      />
      {wordmark ? (
        <Text style={[styles.word, { color: c.brandInk }]}>HUDDLE</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // 1408×768 source → explicit w/h (RN Web ignores aspectRatio here and
  // would render at the intrinsic 1408px width, blowing out the header).
  mark: { width: 51, height: 28 },
  word: { fontSize: 20, fontWeight: '700', letterSpacing: 1 },
});

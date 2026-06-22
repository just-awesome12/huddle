import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useColors } from '@/context/ThemeContext';

/**
 * Renders body text with @mentions highlighted (Phase 16c). App-local; the
 * username pattern mirrors usernameSchema (3..30 lowercase/digit/underscore).
 * `style` is applied to the wrapping Text so it matches the surrounding copy.
 */

const SPLIT_RE = /(@[a-z0-9_]{3,30})/gi;
const EXACT_RE = /^@[a-z0-9_]{3,30}$/i;

export function MentionText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  const parts = text.split(SPLIT_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        EXACT_RE.test(part) ? (
          <Text key={i} style={{ color: c.brand[600], fontWeight: '600' }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

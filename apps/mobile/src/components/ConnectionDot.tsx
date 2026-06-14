import { StyleSheet, View } from 'react-native';
import { useRealtimeStatus } from '@/context/RealtimeContext';

/**
 * Small live-connection indicator: green = live, amber = connecting,
 * red = error. Reads the global "my groups" channel status.
 */
export function ConnectionDot() {
  const status = useRealtimeStatus();
  const color =
    status === 'SUBSCRIBED'
      ? '#22c55e'
      : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
        ? '#ef4444'
        : '#fbbf24';

  return (
    <View
      accessibilityLabel={`Realtime ${status}`}
      testID="realtime-status"
      style={[styles.dot, { backgroundColor: color }]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});

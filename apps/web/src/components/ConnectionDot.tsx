'use client';

import { useRealtime } from './RealtimeProvider';

/**
 * Small live-connection indicator for the app header. Green = live,
 * amber = connecting/reconnecting, red = error. Reflects the global
 * "my groups" channel status from the provider.
 */
export function ConnectionDot() {
  const { status } = useRealtime();

  const { color, label } =
    status === 'SUBSCRIBED'
      ? { color: 'bg-green-500', label: 'Live' }
      : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
        ? { color: 'bg-red-500', label: 'Connection issue' }
        : { color: 'bg-amber-400', label: 'Connecting' };

  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-testid="realtime-status"
      data-status={status}
      title={label}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

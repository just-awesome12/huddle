'use client';

import { useState, useTransition } from 'react';
import { setGroupMuteAction } from '@/actions/notifications';

/**
 * Per-group push mute toggle on the hub banner (Phase 15b). A small
 * bell pill the member can flip to silence push from this group —
 * orthogonal to the global event-type prefs.
 */
export function GroupMuteToggle({
  groupId,
  initialMuted,
}: {
  groupId: string;
  initialMuted: boolean;
}) {
  const [muted, setMuted] = useState(initialMuted);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !muted;
    setMuted(next); // optimistic
    startTransition(async () => {
      const res = await setGroupMuteAction(groupId, next);
      if (!res.ok) setMuted(!next); // revert on failure
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-testid="group-mute-toggle"
      data-muted={muted}
      aria-pressed={muted}
      aria-label={
        muted ? 'Unmute notifications for this group' : 'Mute notifications for this group'
      }
      title={muted ? 'Notifications muted — tap to unmute' : 'Mute notifications for this group'}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3.5 py-[9px] font-display text-[13px] font-extrabold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
    >
      <span aria-hidden>{muted ? '🔕' : '🔔'}</span>
      {muted ? 'Muted' : 'Mute'}
    </button>
  );
}

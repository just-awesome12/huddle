'use client';

import { useEffect, useState } from 'react';
import { trackGroupPresence, type PresenceMember } from '@huddle/api-client/realtime';
import { useRealtime } from './RealtimeProvider';
import { personColor } from '@/lib/group-visuals';

/**
 * "N here now" live-presence pill for the group banner. Tracks the
 * current viewer via Realtime Presence and shows the de-duplicated
 * roster of members currently on the hub. Sits on the gradient banner,
 * so it's styled for white-on-violet.
 */
export function GroupPresence({ groupId, me }: { groupId: string; me: PresenceMember }) {
  const { client } = useRealtime();
  // Seed with self so it reads "1 here" before the first sync.
  const [members, setMembers] = useState<PresenceMember[]>([me]);

  useEffect(() => {
    const unsubscribe = trackGroupPresence(client, groupId, me, setMembers);
    return unsubscribe;
    // me is rebuilt each render; depend on its primitive fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, groupId, me.userId, me.displayName]);

  if (members.length === 0) return null;

  return (
    <span
      data-testid="presence"
      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-[7px] font-display text-[13px] font-extrabold text-white"
    >
      <span className="flex -space-x-2" aria-hidden>
        {members.slice(0, 3).map((m) => (
          <span
            key={m.userId}
            className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold text-white ring-2 ring-white/40"
            style={{ background: personColor(m.userId) }}
          >
            {(m.displayName[0] ?? '?').toUpperCase()}
          </span>
        ))}
      </span>
      {members.length} here
    </span>
  );
}

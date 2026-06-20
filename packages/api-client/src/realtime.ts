import type { RealtimeChannel } from '@supabase/supabase-js';
import type { HuddleClient } from './internal';

/**
 * Framework-free Realtime subscriptions (hooks/providers are app-side —
 * web triggers router.refresh(), mobile invalidates query caches).
 *
 * R-4 (verified empirically in tests/realtime-rls.integration.mjs):
 * Postgres Changes on this stack applies each table's SELECT policy
 * per subscriber. A non-member receives nothing, so plain Postgres
 * Changes channels are safe — no private-channel broadcast needed.
 * The app's Supabase client must have its realtime socket authed as
 * the user (supabase-js does this automatically on auth state change);
 * otherwise the socket is anon and RLS blocks everything.
 *
 * REPLICA IDENTITY FULL (migration 014) means DELETE/UPDATE payloads
 * carry the old row, so `groupId` is always resolvable for routing.
 */

/** The tables whose changes a group's members care about, live. */
export type RealtimeTable =
  | 'ideas'
  | 'group_members'
  | 'groups'
  | 'decisions'
  | 'idea_comments'
  | 'idea_rsvps';

export interface RealtimeChange {
  table: RealtimeTable;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Group the change belongs to, resolved from new/old row. */
  groupId: string | null;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

/**
 * Channel lifecycle status, surfaced for connection indicators.
 * Mirrors supabase-js's subscribe() statuses, narrowed to what the UI
 * cares about.
 */
export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

function resolveGroupId(table: RealtimeTable, row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  // `groups` keys the group on `id`; the rest carry `group_id`.
  const key = table === 'groups' ? 'id' : 'group_id';
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Subscribe to every live change within one group (ideas, membership,
 * the group row itself, and decisions). Returns an unsubscribe fn.
 *
 * Each binding is server-filtered by group_id so the client only
 * receives rows it could already SELECT — RLS is the real gate, the
 * filter just trims noise.
 */
export function subscribeToGroup(
  client: HuddleClient,
  groupId: string,
  onChange: (change: RealtimeChange) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const channel = client.channel(`group:${groupId}`);

  const bind = (table: RealtimeTable, filter: string) => {
    channel.on(
      // postgres_changes isn't in the public RealtimeChannel.on overloads
      // as a string literal type until you pass the config; cast keeps
      // the call site readable without `any` leaking outward.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table, filter },
      (payload: {
        eventType: RealtimeChange['eventType'];
        new: Record<string, unknown> | null;
        old: Record<string, unknown> | null;
      }) => {
        const next = payload.new && Object.keys(payload.new).length ? payload.new : null;
        const prev = payload.old && Object.keys(payload.old).length ? payload.old : null;
        onChange({
          table,
          eventType: payload.eventType,
          groupId: resolveGroupId(table, next ?? prev),
          new: next,
          old: prev,
        });
      },
    );
  };

  bind('ideas', `group_id=eq.${groupId}`);
  bind('group_members', `group_id=eq.${groupId}`);
  bind('groups', `id=eq.${groupId}`);
  bind('decisions', `group_id=eq.${groupId}`);
  bind('idea_comments', `group_id=eq.${groupId}`);
  bind('idea_rsvps', `group_id=eq.${groupId}`);

  channel.subscribe((status) => onStatus?.(status as RealtimeStatus));

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Subscribe to changes that affect the current user's GROUP LIST:
 * their own membership rows (joins / removals) and any group they can
 * see (renames / deletes — RLS already scopes `groups` to membership).
 */
export function subscribeToMyGroups(
  client: HuddleClient,
  userId: string,
  onChange: (change: RealtimeChange) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const channel = client.channel(`my-groups:${userId}`);

  channel.on(
    'postgres_changes' as never,
    {
      event: '*',
      schema: 'public',
      table: 'group_members',
      filter: `user_id=eq.${userId}`,
    },
    (payload: {
      eventType: RealtimeChange['eventType'];
      new: Record<string, unknown> | null;
      old: Record<string, unknown> | null;
    }) => {
      const next = payload.new && Object.keys(payload.new).length ? payload.new : null;
      const prev = payload.old && Object.keys(payload.old).length ? payload.old : null;
      onChange({
        table: 'group_members',
        eventType: payload.eventType,
        groupId: resolveGroupId('group_members', next ?? prev),
        new: next,
        old: prev,
      });
    },
  );

  channel.on(
    'postgres_changes' as never,
    { event: '*', schema: 'public', table: 'groups' },
    (payload: {
      eventType: RealtimeChange['eventType'];
      new: Record<string, unknown> | null;
      old: Record<string, unknown> | null;
    }) => {
      const next = payload.new && Object.keys(payload.new).length ? payload.new : null;
      const prev = payload.old && Object.keys(payload.old).length ? payload.old : null;
      onChange({
        table: 'groups',
        eventType: payload.eventType,
        groupId: resolveGroupId('groups', next ?? prev),
        new: next,
        old: prev,
      });
    },
  );

  channel.subscribe((status) => onStatus?.(status as RealtimeStatus));

  return () => {
    void client.removeChannel(channel);
  };
}

/** A member currently present on a group's hub. */
export interface PresenceMember {
  userId: string;
  displayName: string;
}

/**
 * Track who is currently viewing a group's hub via Realtime Presence.
 * Each client tracks itself keyed by user id (so multiple tabs/devices
 * collapse to one person), and `onChange` fires with the de-duplicated
 * roster on every join/leave/sync. Returns an unsubscribe fn.
 *
 * Presence rides the same authed socket as Postgres Changes; it carries
 * no row data, so there's no RLS surface — only what each client chooses
 * to broadcast about itself.
 */
export function trackGroupPresence(
  client: HuddleClient,
  groupId: string,
  me: PresenceMember,
  onChange: (members: PresenceMember[]) => void,
): () => void {
  const channel = client.channel(`presence:group:${groupId}`, {
    config: { presence: { key: me.userId } },
  });

  const emit = () => {
    const state = channel.presenceState<PresenceMember>();
    const byUser = new Map<string, PresenceMember>();
    for (const metas of Object.values(state)) {
      for (const m of metas) {
        if (m.userId) byUser.set(m.userId, { userId: m.userId, displayName: m.displayName });
      }
    }
    onChange([...byUser.values()]);
  };

  channel.on('presence', { event: 'sync' }, emit);
  channel.on('presence', { event: 'join' }, emit);
  channel.on('presence', { event: 'leave' }, emit);

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') void channel.track(me);
  });

  return () => {
    void client.removeChannel(channel);
  };
}

/** Re-export for providers that want to surface connection state. */
export type { RealtimeChannel };

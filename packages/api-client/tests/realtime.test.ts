import { describe, expect, it } from 'vitest';
import { subscribeToGroup, subscribeToMyGroups, type RealtimeChange } from '../src/realtime';

/**
 * Unit tests for the framework-free realtime helper: channel/binding
 * setup and payload normalisation. The RLS behaviour itself is covered
 * by tests/realtime-rls.integration.mjs (needs a live stack).
 */

interface Binding {
  config: { event: string; schema: string; table: string; filter?: string };
  cb: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  }) => void;
}

function makeClient() {
  const channels: { name: string; bindings: Binding[]; subscribed: boolean }[] = [];
  const removed: string[] = [];
  const client = {
    channel(name: string) {
      const bindings: Binding[] = [];
      const chan = {
        name,
        bindings,
        subscribed: false,
        on(_type: string, config: Binding['config'], cb: Binding['cb']) {
          bindings.push({ config, cb });
          return chan;
        },
        subscribe(cb?: (status: string) => void) {
          chan.subscribed = true;
          cb?.('SUBSCRIBED');
          return chan;
        },
      };
      channels.push(chan);
      return chan;
    },
    removeChannel(chan: { name: string }) {
      removed.push(chan.name);
      return Promise.resolve('ok');
    },
    _channels: channels,
    _removed: removed,
  };
  return client;
}

describe('subscribeToGroup', () => {
  it('opens one channel with bindings for all four group tables', () => {
    const client = makeClient();
    subscribeToGroup(client as never, 'g1', () => {});

    expect(client._channels).toHaveLength(1);
    const chan = client._channels[0]!;
    expect(chan.name).toBe('group:g1');
    expect(chan.subscribed).toBe(true);

    const byTable = Object.fromEntries(chan.bindings.map((b) => [b.config.table, b.config.filter]));
    expect(byTable).toEqual({
      ideas: 'group_id=eq.g1',
      group_members: 'group_id=eq.g1',
      groups: 'id=eq.g1',
      decisions: 'group_id=eq.g1',
      idea_comments: 'group_id=eq.g1',
    });
  });

  it('normalises an INSERT payload and resolves groupId from group_id', () => {
    const client = makeClient();
    const changes: RealtimeChange[] = [];
    subscribeToGroup(client as never, 'g1', (c) => changes.push(c));

    const ideasBinding = client._channels[0]!.bindings.find((b) => b.config.table === 'ideas')!;
    ideasBinding.cb({
      eventType: 'INSERT',
      new: { id: 'i1', group_id: 'g1', title: 'Tacos' },
      old: {},
    });

    expect(changes).toEqual([
      {
        table: 'ideas',
        eventType: 'INSERT',
        groupId: 'g1',
        new: { id: 'i1', group_id: 'g1', title: 'Tacos' },
        old: null,
      },
    ]);
  });

  it('resolves groupId from the OLD row on DELETE (replica identity full)', () => {
    const client = makeClient();
    const changes: RealtimeChange[] = [];
    subscribeToGroup(client as never, 'g1', (c) => changes.push(c));

    const ideasBinding = client._channels[0]!.bindings.find((b) => b.config.table === 'ideas')!;
    ideasBinding.cb({
      eventType: 'DELETE',
      new: {},
      old: { id: 'i1', group_id: 'g1', title: 'Gone' },
    });

    expect(changes[0]).toMatchObject({ eventType: 'DELETE', groupId: 'g1', new: null });
    expect(changes[0]!.old).toEqual({ id: 'i1', group_id: 'g1', title: 'Gone' });
  });

  it('resolves groupId from `id` for the groups table', () => {
    const client = makeClient();
    const changes: RealtimeChange[] = [];
    subscribeToGroup(client as never, 'g1', (c) => changes.push(c));

    const groupsBinding = client._channels[0]!.bindings.find((b) => b.config.table === 'groups')!;
    groupsBinding.cb({
      eventType: 'UPDATE',
      new: { id: 'g1', name: 'Renamed' },
      old: { id: 'g1', name: 'Old' },
    });

    expect(changes[0]).toMatchObject({ table: 'groups', groupId: 'g1' });
  });

  it('returns an unsubscribe that removes the channel', () => {
    const client = makeClient();
    const unsub = subscribeToGroup(client as never, 'g1', () => {});
    unsub();
    expect(client._removed).toEqual(['group:g1']);
  });

  it('forwards the subscribe status to onStatus', () => {
    const client = makeClient();
    const statuses: string[] = [];
    subscribeToGroup(
      client as never,
      'g1',
      () => {},
      (s) => statuses.push(s),
    );
    expect(statuses).toEqual(['SUBSCRIBED']);
  });
});

describe('subscribeToMyGroups', () => {
  it('binds own membership (filtered) and all visible groups', () => {
    const client = makeClient();
    subscribeToMyGroups(client as never, 'u1', () => {});

    const chan = client._channels[0]!;
    expect(chan.name).toBe('my-groups:u1');
    const members = chan.bindings.find((b) => b.config.table === 'group_members')!;
    const groups = chan.bindings.find((b) => b.config.table === 'groups')!;
    expect(members.config.filter).toBe('user_id=eq.u1');
    // groups has no client filter — RLS scopes it to my memberships.
    expect(groups.config.filter).toBeUndefined();
  });

  it('emits a membership change with the group it concerns', () => {
    const client = makeClient();
    const changes: RealtimeChange[] = [];
    subscribeToMyGroups(client as never, 'u1', (c) => changes.push(c));

    const members = client._channels[0]!.bindings.find((b) => b.config.table === 'group_members')!;
    members.cb({ eventType: 'DELETE', new: {}, old: { group_id: 'g9', user_id: 'u1' } });

    expect(changes[0]).toMatchObject({
      table: 'group_members',
      eventType: 'DELETE',
      groupId: 'g9',
    });
  });
});

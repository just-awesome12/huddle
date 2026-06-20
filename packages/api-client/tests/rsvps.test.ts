import { describe, expect, it, vi } from 'vitest';
import {
  setRsvp,
  removeRsvp,
  fetchIdeaRsvps,
  fetchGroupRsvpState,
  rsvpQueryKeys,
} from '../src/rsvps';

function makeClient({
  user = { id: 'user-1' },
  queryData = [] as unknown,
  error = null as unknown,
} = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: queryData, error })),
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe('rsvpQueryKeys', () => {
  it('scopes by idea and group', () => {
    expect(rsvpQueryKeys.idea('i1')).toEqual(['ideas', 'i1', 'rsvps']);
    expect(rsvpQueryKeys.groupState('g1')).toEqual(['groups', 'g1', 'rsvp-state']);
  });
});

describe('setRsvp', () => {
  it('upserts the caller RSVP keyed on idea+user', async () => {
    const client = makeClient();
    await setRsvp(client as never, 'i1', 'g1', 'going');
    expect(client._chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        idea_id: 'i1',
        user_id: 'user-1',
        group_id: 'g1',
        status: 'going',
      }),
      { onConflict: 'idea_id,user_id' },
    );
  });

  it('maps an RLS denial to unauthorized', async () => {
    const client = makeClient({ error: { code: '42501', message: 'denied' } });
    await expect(setRsvp(client as never, 'i1', 'g1', 'going')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('removeRsvp', () => {
  it('deletes the caller row for the idea', async () => {
    const client = makeClient();
    await removeRsvp(client as never, 'i1');
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('idea_id', 'i1');
    expect(client._chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('fetchIdeaRsvps', () => {
  it('maps rows to IdeaRsvp', async () => {
    const rows = [
      {
        user_id: 'user-2',
        status: 'going',
        profiles: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
      },
    ];
    const client = makeClient({ queryData: rows });
    const out = await fetchIdeaRsvps(client as never, 'i1');
    expect(out[0]!.userId).toBe('user-2');
    expect(out[0]!.status).toBe('going');
    expect(out[0]!.profile.display_name).toBe('Bob');
  });
});

describe('fetchGroupRsvpState', () => {
  it('counts going per idea and records the caller status', async () => {
    const rows = [
      { idea_id: 'i1', user_id: 'user-1', status: 'going' },
      { idea_id: 'i1', user_id: 'user-2', status: 'going' },
      { idea_id: 'i1', user_id: 'user-3', status: 'maybe' },
      { idea_id: 'i2', user_id: 'user-2', status: 'going' },
    ];
    const client = makeClient({ queryData: rows });
    const state = await fetchGroupRsvpState(client as never, 'g1', 'user-1');
    expect(state.goingByIdea).toEqual({ i1: 2, i2: 1 });
    expect(state.mineByIdea).toEqual({ i1: 'going' });
  });
});

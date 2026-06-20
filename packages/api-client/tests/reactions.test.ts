import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupReactions,
  toggleReaction,
  reactionTargetKey,
  reactionQueryKeys,
} from '../src/reactions';

function makeClient({
  user = { id: 'user-1' },
  queryData = [] as unknown,
  error = null as unknown,
} = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error }),
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

describe('reactionTargetKey / queryKeys', () => {
  it('builds a stable target key', () => {
    expect(reactionTargetKey('idea', 'i1')).toBe('idea:i1');
  });
  it('scopes the group query', () => {
    expect(reactionQueryKeys.group('g1')).toEqual(['groups', 'g1', 'reactions']);
  });
});

describe('fetchGroupReactions', () => {
  it('aggregates per target into ordered emoji summaries with mine', async () => {
    const rows = [
      { target_type: 'idea', target_id: 'i1', emoji: '🔥', user_id: 'user-2' },
      { target_type: 'idea', target_id: 'i1', emoji: '🔥', user_id: 'user-1' },
      { target_type: 'idea', target_id: 'i1', emoji: '👍', user_id: 'user-2' },
      { target_type: 'decision', target_id: 'd1', emoji: '🎉', user_id: 'user-3' },
    ];
    const client = makeClient({ queryData: rows });
    const out = await fetchGroupReactions(client as never, 'g1', 'user-1');

    // 👍 sorts before 🔥 (canonical order); 🔥 has count 2 and is mine.
    expect(out['idea:i1']).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ]);
    expect(out['decision:d1']).toEqual([{ emoji: '🎉', count: 1, mine: false }]);
  });
});

describe('toggleReaction', () => {
  it('inserts when not already reacted', async () => {
    const client = makeClient();
    await toggleReaction(
      client as never,
      { groupId: 'g1', targetType: 'idea', targetId: 'i1', emoji: '🔥' },
      false,
    );
    expect(client._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        target_type: 'idea',
        target_id: 'i1',
        user_id: 'user-1',
        emoji: '🔥',
      }),
    );
  });

  it('deletes when already reacted', async () => {
    const client = makeClient();
    await toggleReaction(
      client as never,
      { groupId: 'g1', targetType: 'idea', targetId: 'i1', emoji: '🔥' },
      true,
    );
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('emoji', '🔥');
    expect(client._chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('maps an RLS denial to unauthorized', async () => {
    const client = makeClient({ error: { code: '42501', message: 'denied' } });
    await expect(
      toggleReaction(
        client as never,
        { groupId: 'g1', targetType: 'idea', targetId: 'i1', emoji: '🔥' },
        false,
      ),
    ).rejects.toMatchObject({ huddle: { kind: 'unauthorized' } });
  });
});

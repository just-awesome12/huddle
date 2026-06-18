import { describe, expect, it, vi } from 'vitest';
import { fetchGroupVoteState, voteIdea, unvoteIdea, voteQueryKeys } from '../src/votes';

function makeClient({ user = { id: 'me' }, data = null as unknown, error = null as unknown } = {}) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
  return client as never;
}
const chainOf = (c: unknown) => (c as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;

describe('fetchGroupVoteState', () => {
  it('aggregates counts and the caller’s votes', async () => {
    const rows = [
      { idea_id: 'a', user_id: 'me' },
      { idea_id: 'a', user_id: 'u2' },
      { idea_id: 'b', user_id: 'u2' },
    ];
    const client = makeClient({ data: rows });
    chainOf(client).eq!.mockReturnValue({
      then: (r: (v: unknown) => void) => r({ data: rows, error: null }),
    });
    const out = await fetchGroupVoteState(client, 'g1', 'me');
    expect(out.countByIdea).toEqual({ a: 2, b: 1 });
    expect(out.myVotes).toEqual(['a']);
  });
});

describe('voteIdea', () => {
  it('upserts the caller’s vote, ignoring duplicates', async () => {
    const client = makeClient();
    await voteIdea(client, 'idea-1');
    const c = chainOf(client);
    const [row, opts] = c.upsert!.mock.calls[0]!;
    expect(row).toEqual({ idea_id: 'idea-1', user_id: 'me' });
    expect(opts).toEqual({ onConflict: 'idea_id,user_id', ignoreDuplicates: true });
  });
});

describe('unvoteIdea', () => {
  it('deletes the caller’s vote', async () => {
    const client = makeClient();
    await unvoteIdea(client, 'idea-1');
    const c = chainOf(client);
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('idea_id', 'idea-1');
    expect(c.eq).toHaveBeenCalledWith('user_id', 'me');
  });
});

describe('voteQueryKeys', () => {
  it('scopes by group', () => {
    expect(voteQueryKeys.forGroup('g1')).toEqual(['groups', 'g1', 'votes']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  reportIdea,
  fetchMyReportedIdeaIds,
  blockUser,
  unblockUser,
  fetchBlockedProfiles,
  moderationQueryKeys,
} from '../src/moderation';

function makeClient({
  user = { id: 'user-1' },
  data = null as unknown,
  error = null as unknown,
} = {}) {
  const result = { data, error };
  const chain = {
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
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

describe('reportIdea', () => {
  it('inserts a report as the caller', async () => {
    const client = makeClient();
    await reportIdea(client, { ideaId: 'idea-1', reason: 'spam', details: 'bad' });
    const c = chainOf(client);
    expect(c.insert).toHaveBeenCalledWith({
      idea_id: 'idea-1',
      reporter_id: 'user-1',
      reason: 'spam',
      details: 'bad',
    });
  });

  it('sends null details when omitted', async () => {
    const client = makeClient();
    await reportIdea(client, { ideaId: 'idea-1', reason: 'other' });
    expect(chainOf(client).insert).toHaveBeenCalledWith(expect.objectContaining({ details: null }));
  });
});

describe('fetchMyReportedIdeaIds', () => {
  it('returns the reported idea ids', async () => {
    const client = makeClient({ data: [{ idea_id: 'a' }, { idea_id: 'b' }] });
    // select() resolves via then for this query (no order)
    const c = chainOf(client);
    c.select!.mockReturnValue({
      then: (r: (v: unknown) => void) =>
        r({ data: [{ idea_id: 'a' }, { idea_id: 'b' }], error: null }),
    });
    expect(await fetchMyReportedIdeaIds(client)).toEqual(['a', 'b']);
  });
});

describe('blockUser / unblockUser', () => {
  it('upserts a block for the caller', async () => {
    const client = makeClient();
    await blockUser(client, 'bad-user');
    const c = chainOf(client);
    const [row, opts] = c.upsert!.mock.calls[0]!;
    expect(row).toEqual({ blocker_id: 'user-1', blocked_id: 'bad-user' });
    expect(opts).toEqual({ onConflict: 'blocker_id,blocked_id' });
  });

  it('deletes the block scoped to the caller', async () => {
    const client = makeClient();
    await unblockUser(client, 'bad-user');
    const c = chainOf(client);
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('blocker_id', 'user-1');
    expect(c.eq).toHaveBeenCalledWith('blocked_id', 'bad-user');
  });
});

describe('fetchBlockedProfiles', () => {
  it('unwraps the embedded profile and drops nulls', async () => {
    const rows = [
      { blocked: { id: 'b', username: 'bob', display_name: 'Bob', avatar_url: null } },
      { blocked: null },
    ];
    const client = makeClient({ data: rows });
    const out = await fetchBlockedProfiles(client);
    expect(out).toEqual([{ id: 'b', username: 'bob', display_name: 'Bob', avatar_url: null }]);
  });
});

describe('moderationQueryKeys', () => {
  it('scopes keys by user', () => {
    expect(moderationQueryKeys.reportedIdeas('u1')).toEqual(['moderation', 'reported', 'u1']);
    expect(moderationQueryKeys.blocked('u1')).toEqual(['moderation', 'blocked', 'u1']);
  });
});

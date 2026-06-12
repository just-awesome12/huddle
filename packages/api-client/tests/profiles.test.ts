import { describe, expect, it, vi } from 'vitest';
import { searchProfiles, profileQueryKeys } from '../src/profiles';

function makeClient({
  user = { id: 'user-1' },
  queryData = null as unknown,
  queryError = null as unknown,
} = {}) {
  const result = { data: queryData, error: queryError };
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(fromChain),
    _chain: fromChain,
  };
}

describe('profileQueryKeys', () => {
  it('keys searches by query string', () => {
    expect(profileQueryKeys.search('ab')).toEqual(['profiles', 'search', 'ab']);
  });
});

describe('searchProfiles', () => {
  it('prefix-matches case-insensitively, excludes self, caps at 10', async () => {
    const rows = [{ id: 'user-2', username: 'pal', display_name: 'Pal', avatar_url: null }];
    const client = makeClient({ queryData: rows });
    const result = await searchProfiles(client as never, 'pa');
    expect(result).toHaveLength(1);
    expect(client._chain.ilike).toHaveBeenCalledWith('username', 'pa%');
    expect(client._chain.neq).toHaveBeenCalledWith('id', 'user-1');
    expect(client._chain.limit).toHaveBeenCalledWith(10);
  });

  it('escapes underscore (an ILIKE wildcard) in the query', async () => {
    const client = makeClient({ queryData: [] });
    await searchProfiles(client as never, 'a_b');
    expect(client._chain.ilike).toHaveBeenCalledWith('username', 'a\\_b%');
  });

  it('throws unauthorized when not signed in', async () => {
    const client = makeClient({ user: null as never });
    await expect(searchProfiles(client as never, 'x')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });

  it('returns [] for empty data', async () => {
    const client = makeClient({ queryData: null });
    await expect(searchProfiles(client as never, 'x')).resolves.toEqual([]);
  });
});

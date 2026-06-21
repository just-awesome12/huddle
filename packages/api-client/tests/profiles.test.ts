import { describe, expect, it, vi } from 'vitest';
import {
  searchProfiles,
  profileQueryKeys,
  fetchProfile,
  updateProfile,
  uploadAvatar,
} from '../src/profiles';

function makeProfileClient({
  user = { id: 'user-1' },
  data = null as unknown,
  error = null as unknown,
  publicUrl = 'https://cdn.example/avatars/user-1/a.png',
} = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  const bucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'p' }, error }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue(chain),
    storage: { from: vi.fn().mockReturnValue(bucket) },
    _chain: chain,
    _bucket: bucket,
  };
}

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

describe('fetchProfile', () => {
  it('returns the profile row', async () => {
    const client = makeProfileClient({
      data: { id: 'user-1', display_name: 'Alice', bio: null, avatar_url: null },
    });
    const p = await fetchProfile(client as never, 'user-1');
    expect(p.id).toBe('user-1');
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'user-1');
  });
});

describe('updateProfile', () => {
  it('updates the caller own row', async () => {
    const client = makeProfileClient({ data: { id: 'user-1', display_name: 'New' } });
    await updateProfile(client as never, { display_name: 'New', bio: 'hi' });
    expect(client._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'New', bio: 'hi' }),
    );
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('maps an RLS denial to unauthorized', async () => {
    const client = makeProfileClient({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(updateProfile(client as never, { display_name: 'X' })).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('uploadAvatar', () => {
  it('uploads under the user folder and returns the public URL', async () => {
    const client = makeProfileClient();
    const url = await uploadAvatar(client as never, {
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
      ext: 'png',
    });
    expect(client.storage.from).toHaveBeenCalledWith('avatars');
    const path = (client._bucket.upload as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(path).toMatch(/^user-1\/avatar-\d+\.png$/);
    expect(url).toContain('https://');
  });
});

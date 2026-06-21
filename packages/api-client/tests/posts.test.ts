import { describe, expect, it, vi } from 'vitest';
import { fetchGroupPosts, addGroupPost, deleteGroupPost, postQueryKeys } from '../src/posts';

function makeClient({ user = { id: 'me' }, data = null as unknown, error = null as unknown } = {}) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
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

describe('postQueryKeys', () => {
  it('keys the wall under the group', () => {
    expect(postQueryKeys.wall('g1')).toEqual(['groups', 'g1', 'posts']);
  });
});

describe('fetchGroupPosts', () => {
  it('reads a group wall newest-first', async () => {
    const rows = [{ id: 'p1', body: 'hi' }];
    const client = makeClient({ data: rows });
    expect(await fetchGroupPosts(client, 'g1')).toBe(rows);
    const c = chainOf(client);
    expect(c.eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(100);
  });
});

describe('addGroupPost', () => {
  it('inserts as the current user', async () => {
    const client = makeClient();
    await addGroupPost(client, { groupId: 'g1', body: 'anyone free?' });
    expect(chainOf(client).insert).toHaveBeenCalledWith({
      group_id: 'g1',
      author_id: 'me',
      body: 'anyone free?',
    });
  });

  it('maps an RLS denial', async () => {
    const client = makeClient({ error: { code: '42501', message: 'denied' } });
    await expect(addGroupPost(client, { groupId: 'g1', body: 'x' })).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('deleteGroupPost', () => {
  it('deletes by id', async () => {
    const client = makeClient();
    await deleteGroupPost(client, 'p1');
    expect(chainOf(client).delete).toHaveBeenCalled();
    expect(chainOf(client).eq).toHaveBeenCalledWith('id', 'p1');
  });
});

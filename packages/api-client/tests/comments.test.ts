import { describe, expect, it, vi } from 'vitest';
import {
  fetchIdeaComments,
  fetchGroupCommentCounts,
  addComment,
  deleteComment,
  commentQueryKeys,
} from '../src/comments';

function makeClient({ user = { id: 'me' }, data = null as unknown, error = null as unknown } = {}) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
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

describe('fetchIdeaComments', () => {
  it('reads a thread oldest-first', async () => {
    const rows = [{ id: 'c1', body: 'hi' }];
    const client = makeClient({ data: rows });
    expect(await fetchIdeaComments(client, 'idea-1')).toBe(rows);
    const c = chainOf(client);
    expect(c.eq).toHaveBeenCalledWith('idea_id', 'idea-1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});

describe('fetchGroupCommentCounts', () => {
  it('aggregates per-idea counts', async () => {
    const rows = [{ idea_id: 'a' }, { idea_id: 'a' }, { idea_id: 'b' }];
    const client = makeClient();
    chainOf(client).eq!.mockReturnValue({
      then: (r: (v: unknown) => void) => r({ data: rows, error: null }),
    });
    expect(await fetchGroupCommentCounts(client, 'g1')).toEqual({ a: 2, b: 1 });
  });
});

describe('addComment', () => {
  it('inserts as the caller with idea + group', async () => {
    const client = makeClient();
    await addComment(client, { ideaId: 'i1', groupId: 'g1', body: 'hello' });
    expect(chainOf(client).insert).toHaveBeenCalledWith({
      idea_id: 'i1',
      group_id: 'g1',
      author_id: 'me',
      body: 'hello',
    });
  });
});

describe('deleteComment', () => {
  it('deletes by id (RLS enforces author/admin)', async () => {
    const client = makeClient();
    await deleteComment(client, 'c1');
    const c = chainOf(client);
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('commentQueryKeys', () => {
  it('keys threads + counts under the group', () => {
    expect(commentQueryKeys.thread('g1', 'i1')).toEqual([
      'groups',
      'g1',
      'comments',
      'thread',
      'i1',
    ]);
    expect(commentQueryKeys.counts('g1')).toEqual(['groups', 'g1', 'comments', 'counts']);
  });
});

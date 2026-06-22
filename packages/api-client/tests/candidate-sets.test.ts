import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupCandidateSets,
  createCandidateSet,
  deleteCandidateSet,
  candidateSetQueryKeys,
} from '../src/candidate-sets';

function makeClient({ user = { id: 'me' }, data = null as unknown, error = null as unknown } = {}) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
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

describe('candidateSetQueryKeys', () => {
  it('keys the list under the group', () => {
    expect(candidateSetQueryKeys.list('g1')).toEqual(['groups', 'g1', 'candidate-sets']);
  });
});

describe('fetchGroupCandidateSets', () => {
  it('reads a group’s sets newest-first', async () => {
    const rows = [{ id: 's1', name: 'Friday dinner' }];
    const client = makeClient({ data: rows });
    expect(await fetchGroupCandidateSets(client, 'g1')).toBe(rows);
    const c = chainOf(client);
    expect(c.eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('createCandidateSet', () => {
  it('inserts with the current user + idea ids', async () => {
    const client = makeClient({ data: { id: 's1' } });
    await createCandidateSet(client, {
      groupId: 'g1',
      name: 'Friday dinner',
      ideaIds: ['i1', 'i2'],
    });
    expect(chainOf(client).insert).toHaveBeenCalledWith({
      group_id: 'g1',
      created_by: 'me',
      name: 'Friday dinner',
      idea_ids: ['i1', 'i2'],
    });
  });

  it('maps an RLS denial', async () => {
    const client = makeClient({ error: { code: '42501', message: 'denied' } });
    await expect(
      createCandidateSet(client, { groupId: 'g1', name: 'x', ideaIds: ['i1', 'i2'] }),
    ).rejects.toMatchObject({ huddle: { kind: 'unauthorized' } });
  });
});

describe('deleteCandidateSet', () => {
  it('deletes by id', async () => {
    const client = makeClient();
    await deleteCandidateSet(client, 's1');
    expect(chainOf(client).delete).toHaveBeenCalled();
    expect(chainOf(client).eq).toHaveBeenCalledWith('id', 's1');
  });
});

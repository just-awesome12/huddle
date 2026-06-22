import { describe, expect, it, vi } from 'vitest';
import {
  fetchMyGroups,
  fetchGroup,
  fetchGroupMembers,
  createGroup,
  renameGroup,
  updateGroup,
  deleteGroup,
  leaveGroup,
  removeMember,
  searchPublicGroups,
  requestToJoin,
  fetchJoinRequests,
  respondToJoinRequest,
  fetchMyJoinRequests,
  withdrawJoinRequest,
  groupQueryKeys,
} from '../src/groups';

// -----------------------------------------------------------------------
// Minimal Supabase client mock factory
// -----------------------------------------------------------------------

function makeGroup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'group-1',
    name: 'Game Night',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClient({
  user = { id: 'user-1' },
  queryData = null as unknown,
  queryError = null as unknown,
} = {}) {
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: queryData, error: queryError }),
    // When no .single() is chained, the chain itself resolves
    then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: queryData, error: queryError })),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(fromChain),
    rpc: vi.fn().mockResolvedValue({ data: queryData, error: queryError }),
    _chain: fromChain,
  };
}

// -----------------------------------------------------------------------
// groupQueryKeys
// -----------------------------------------------------------------------

describe('groupQueryKeys', () => {
  it('all returns the stable top-level key', () => {
    expect(groupQueryKeys.all).toEqual(['groups']);
  });

  it('detail scopes by id', () => {
    expect(groupQueryKeys.detail('abc')).toEqual(['groups', 'abc']);
  });

  it('members scopes by group id', () => {
    expect(groupQueryKeys.members('abc')).toEqual(['groups', 'abc', 'members']);
  });
});

// -----------------------------------------------------------------------
// fetchMyGroups
// -----------------------------------------------------------------------

describe('fetchMyGroups', () => {
  it('returns mapped GroupWithRole rows', async () => {
    const raw = [
      {
        ...makeGroup(),
        group_members: [{ role: 'admin', joined_at: '2026-01-01T00:00:00Z' }],
      },
    ];
    const client = makeClient({ queryData: raw });
    // Override the chain so the array resolves directly (not via .single())
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: raw, error: null }),
    );

    const result = await fetchMyGroups(client as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.myRole).toBe('admin');
    expect(result[0]!.name).toBe('Game Night');
    expect(result[0]!.joinedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('returns an empty array when the user is in no groups', async () => {
    const client = makeClient({ queryData: [] });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null }),
    );
    const result = await fetchMyGroups(client as never);
    expect(result).toEqual([]);
  });

  it('throws a HuddleError when the query fails', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { code: '42501', message: 'denied' } }),
    );
    await expect(fetchMyGroups(client as never)).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });

  it('throws when user is not authenticated', async () => {
    const client = makeClient({ user: null as never });
    await expect(fetchMyGroups(client as never)).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

// -----------------------------------------------------------------------
// fetchGroup
// -----------------------------------------------------------------------

describe('fetchGroup', () => {
  it('returns a single group row', async () => {
    const group = makeGroup();
    const client = makeClient({ queryData: group });
    const result = await fetchGroup(client as never, 'group-1');
    expect(result.id).toBe('group-1');
    expect(result.name).toBe('Game Night');
  });

  it('throws when RLS denies access', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(fetchGroup(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

// -----------------------------------------------------------------------
// fetchGroupMembers
// -----------------------------------------------------------------------

describe('fetchGroupMembers', () => {
  it('maps rows to GroupMemberWithProfile shape', async () => {
    const raw = [
      {
        user_id: 'user-1',
        role: 'admin' as const,
        joined_at: '2026-01-01T00:00:00Z',
        profiles: {
          id: 'user-1',
          username: 'alice',
          display_name: 'Alice',
          avatar_url: null,
        },
      },
    ];
    const client = makeClient({ queryData: raw });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: raw, error: null }),
    );

    const result = await fetchGroupMembers(client as never, 'group-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('admin');
    expect(result[0]!.profile.username).toBe('alice');
    expect(result[0]!.groupId).toBe('group-1');
  });

  it('returns an empty array when the group has no members (edge case)', async () => {
    const client = makeClient({ queryData: [] });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null }),
    );
    const result = await fetchGroupMembers(client as never, 'group-1');
    expect(result).toEqual([]);
  });

  it('throws when query fails', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '23514', message: 'cannot leave group with zero admins' },
    });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({
        data: null,
        error: { code: '23514', message: 'cannot leave group with zero admins' },
      }),
    );
    await expect(fetchGroupMembers(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'validation' },
    });
  });
});

// -----------------------------------------------------------------------
// Error mapping — verify check_violation surfaces as 'validation'
// (Integration with mapSupabaseError, the sole-admin guard path)
// -----------------------------------------------------------------------

describe('createGroup', () => {
  it('calls the create_group RPC and returns the row', async () => {
    const group = makeGroup();
    const client = makeClient({ queryData: group });
    const result = await createGroup(client as never, 'Game Night');
    expect(result.id).toBe('group-1');
    expect(client.rpc).toHaveBeenCalledWith(
      'create_group',
      expect.objectContaining({ p_name: 'Game Night' }),
    );
  });

  it('forwards description/location/tags/visibility options', async () => {
    const client = makeClient({ queryData: makeGroup() });
    await createGroup(client as never, 'Taco Lovers', {
      description: 'We love tacos',
      location: 'Austin',
      tags: ['food', 'mexican'],
      visibility: 'public',
    });
    expect(client.rpc).toHaveBeenCalledWith('create_group', {
      p_name: 'Taco Lovers',
      p_description: 'We love tacos',
      p_location: 'Austin',
      p_tags: ['food', 'mexican'],
      p_visibility: 'public',
    });
  });

  it('maps the RPC auth rejection (42501) to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'not authenticated' },
    });
    await expect(createGroup(client as never, 'X')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('renameGroup', () => {
  it('updates the name and returns the row', async () => {
    const group = makeGroup({ name: 'Renamed' });
    const client = makeClient({ queryData: group });
    const result = await renameGroup(client as never, 'group-1', 'Renamed');
    expect(result.name).toBe('Renamed');
    expect(client._chain.update).toHaveBeenCalledWith({ name: 'Renamed' });
  });

  it('maps RLS denial to unauthorized (non-admin rename)', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(renameGroup(client as never, 'group-1', 'X')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('deleteGroup', () => {
  it('resolves on success', async () => {
    const client = makeClient({ queryData: null });
    await expect(deleteGroup(client as never, 'group-1')).resolves.toBeUndefined();
    expect(client._chain.delete).toHaveBeenCalled();
  });
});

describe('leaveGroup', () => {
  it('deletes own membership row', async () => {
    const client = makeClient({ queryData: null });
    await expect(leaveGroup(client as never, 'group-1')).resolves.toBeUndefined();
    expect(client._chain.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(client._chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('maps the sole-admin trigger error (23514) to validation', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '23514', message: 'cannot leave group with zero admins' },
    });
    await expect(leaveGroup(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'validation', code: '23514' },
    });
  });
});

describe('removeMember', () => {
  it('deletes the target membership row', async () => {
    const client = makeClient({ queryData: null });
    await expect(removeMember(client as never, 'group-1', 'user-2')).resolves.toBeUndefined();
    expect(client._chain.eq).toHaveBeenCalledWith('user_id', 'user-2');
  });

  it('maps RLS denial to unauthorized (non-admin kick)', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(removeMember(client as never, 'group-1', 'user-2')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('sole-admin guard error mapping', () => {
  it('check_violation (23514) maps to kind:validation via fetchGroupMembers', async () => {
    const solAdminError = { code: '23514', message: 'cannot leave group with zero admins' };
    const client = makeClient({ queryData: null, queryError: solAdminError });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: solAdminError }),
    );

    try {
      await fetchGroupMembers(client as never, 'group-1');
      throw new Error('should have thrown');
    } catch (e: unknown) {
      expect((e as { huddle: { kind: string } }).huddle.kind).toBe('validation');
    }
  });
});

// -----------------------------------------------------------------------
// updateGroup
// -----------------------------------------------------------------------

describe('updateGroup', () => {
  it('updates the provided fields and returns the row', async () => {
    const client = makeClient({ queryData: makeGroup({ visibility: 'public' }) });
    const result = await updateGroup(client as never, 'group-1', {
      description: 'desc',
      visibility: 'public',
    });
    expect(result.id).toBe('group-1');
    expect(client._chain.update).toHaveBeenCalledWith({
      description: 'desc',
      visibility: 'public',
    });
  });

  it('passes the lite_mode flag through (16d)', async () => {
    const client = makeClient({ queryData: makeGroup({ lite_mode: true }) });
    await updateGroup(client as never, 'group-1', { lite_mode: true });
    expect(client._chain.update).toHaveBeenCalledWith({ lite_mode: true });
  });

  it('maps RLS denial to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(updateGroup(client as never, 'group-1', { name: 'X' })).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

// -----------------------------------------------------------------------
// searchPublicGroups
// -----------------------------------------------------------------------

describe('searchPublicGroups', () => {
  it('filters to public groups and returns rows', async () => {
    const rows = [makeGroup({ visibility: 'public' })];
    const client = makeClient({ queryData: rows });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
    );
    const result = await searchPublicGroups(client as never, {});
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('visibility', 'public');
  });

  it('sanitizes a free-text query before building the or() filter', async () => {
    const client = makeClient({ queryData: [] });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null }),
    );
    await searchPublicGroups(client as never, { q: 'ta,co(s)' });
    const orArg = (client._chain.or as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(orArg).not.toMatch(/[,()]/.source.replace(/[()]/g, '')); // no raw commas
    expect(orArg).toContain('name.ilike.%ta co s%');
  });

  it('applies a tag filter via overlaps', async () => {
    const client = makeClient({ queryData: [] });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null }),
    );
    await searchPublicGroups(client as never, { tags: ['food'] });
    expect(client._chain.overlaps).toHaveBeenCalledWith('tags', ['food']);
  });
});

// -----------------------------------------------------------------------
// Join requests
// -----------------------------------------------------------------------

describe('requestToJoin', () => {
  it('calls the request_to_join RPC', async () => {
    const req = { id: 'r1', status: 'pending' };
    const client = makeClient({ queryData: req });
    const result = await requestToJoin(client as never, 'group-1', 'pick me');
    expect(result).toMatchObject({ id: 'r1' });
    expect(client.rpc).toHaveBeenCalledWith('request_to_join', {
      p_group_id: 'group-1',
      p_message: 'pick me',
    });
  });

  it('surfaces the HD006 already-pending code', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: 'HD006', message: 'pending' },
    });
    await expect(requestToJoin(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { code: 'HD006' },
    });
  });
});

describe('respondToJoinRequest', () => {
  it('calls the respond_to_join_request RPC with approve', async () => {
    const client = makeClient({ queryData: { id: 'r1', status: 'approved' } });
    const result = await respondToJoinRequest(client as never, 'r1', true);
    expect(result).toMatchObject({ status: 'approved' });
    expect(client.rpc).toHaveBeenCalledWith('respond_to_join_request', {
      p_request_id: 'r1',
      p_approve: true,
    });
  });
});

describe('fetchJoinRequests', () => {
  it('maps rows to JoinRequestWithProfile', async () => {
    const rows = [
      {
        id: 'r1',
        group_id: 'group-1',
        user_id: 'user-2',
        status: 'pending',
        message: 'hi',
        created_at: '2026-01-01T00:00:00Z',
        profiles: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
      },
    ];
    const client = makeClient({ queryData: rows });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
    );
    const result = await fetchJoinRequests(client as never, 'group-1');
    expect(result[0]!.profile.username).toBe('bob');
    expect(result[0]!.groupId).toBe('group-1');
  });
});

describe('fetchMyJoinRequests', () => {
  it('returns the caller pending requests', async () => {
    const rows = [{ id: 'r1', group_id: 'group-1', status: 'pending' }];
    const client = makeClient({ queryData: rows });
    vi.spyOn(client._chain, 'then').mockImplementation((resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
    );
    const result = await fetchMyJoinRequests(client as never);
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('withdrawJoinRequest', () => {
  it('deletes the request row', async () => {
    const client = makeClient({ queryData: null });
    await expect(withdrawJoinRequest(client as never, 'r1')).resolves.toBeUndefined();
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'r1');
  });
});

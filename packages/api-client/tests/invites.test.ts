import { describe, expect, it, vi } from 'vitest';
import {
  createInvite,
  fetchGroupInvites,
  fetchMyPendingInvites,
  revokeInvite,
  peekInvite,
  acceptInvite,
  inviteErrorKind,
  inviteQueryKeys,
} from '../src/invites';

// -----------------------------------------------------------------------
// Minimal Supabase client mock factory
// -----------------------------------------------------------------------

function makeInvite(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'invite-1',
    group_id: 'group-1',
    token: 'tok_' + 'a'.repeat(42),
    invited_email: null,
    invited_user_id: null,
    created_by: 'user-1',
    expires_at: '2026-12-31T00:00:00Z',
    accepted_by: null,
    accepted_at: null,
    created_at: '2026-06-11T00:00:00Z',
    ...overrides,
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
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  // rpc() must support both `await client.rpc(...)` and
  // `await client.rpc(...).single()`.
  const rpcChain = {
    single: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(fromChain),
    rpc: vi.fn().mockReturnValue(rpcChain),
    _chain: fromChain,
    _rpcChain: rpcChain,
  };
}

// -----------------------------------------------------------------------
// inviteQueryKeys
// -----------------------------------------------------------------------

describe('inviteQueryKeys', () => {
  it('scopes invite lists under the group key', () => {
    expect(inviteQueryKeys.forGroup('g1')).toEqual(['groups', 'g1', 'invites']);
  });

  it('keys peeks by token', () => {
    expect(inviteQueryKeys.peek('t1')).toEqual(['invites', 'peek', 't1']);
  });
});

// -----------------------------------------------------------------------
// createInvite
// -----------------------------------------------------------------------

describe('createInvite', () => {
  it('inserts with created_by from the session and returns the row (incl. token)', async () => {
    const invite = makeInvite();
    const client = makeClient({ queryData: invite });
    const result = await createInvite(client as never, { groupId: 'group-1' });
    expect(result.token).toMatch(/^tok_/);
    expect(client._chain.insert).toHaveBeenCalledWith({
      group_id: 'group-1',
      invited_email: null,
      invited_user_id: null,
      created_by: 'user-1',
    });
  });

  it('passes through invitedEmail / invitedUserId', async () => {
    const client = makeClient({ queryData: makeInvite() });
    await createInvite(client as never, {
      groupId: 'group-1',
      invitedEmail: 'pal@example.com',
    });
    expect(client._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ invited_email: 'pal@example.com' }),
    );
  });

  it('maps RLS denial (non-admin) to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(createInvite(client as never, { groupId: 'group-1' })).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });

  it('maps the already-a-member trigger (unique_violation) to conflict', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '23505', message: 'user is already a member of this group' },
    });
    await expect(
      createInvite(client as never, { groupId: 'group-1', invitedUserId: 'user-9' }),
    ).rejects.toMatchObject({ huddle: { kind: 'conflict' } });
  });
});

// -----------------------------------------------------------------------
// fetchGroupInvites / revokeInvite
// -----------------------------------------------------------------------

describe('fetchGroupInvites', () => {
  it('filters to open invites for the group', async () => {
    const client = makeClient({ queryData: [makeInvite()] });
    const result = await fetchGroupInvites(client as never, 'group-1');
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(client._chain.is).toHaveBeenCalledWith('accepted_at', null);
  });

  it('returns [] for empty data', async () => {
    const client = makeClient({ queryData: null });
    await expect(fetchGroupInvites(client as never, 'group-1')).resolves.toEqual([]);
  });
});

describe('fetchMyPendingInvites', () => {
  it('filters to open, unexpired invites addressed to the caller', async () => {
    const client = makeClient({ queryData: [makeInvite({ invited_user_id: 'user-1' })] });
    const result = await fetchMyPendingInvites(client as never);
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('invited_user_id', 'user-1');
    expect(client._chain.is).toHaveBeenCalledWith('accepted_at', null);
    expect(client._chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('throws unauthorized when not signed in', async () => {
    const client = makeClient({ user: null as never });
    await expect(fetchMyPendingInvites(client as never)).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('revokeInvite', () => {
  it('deletes by invite id', async () => {
    const client = makeClient({ queryData: null });
    await expect(revokeInvite(client as never, 'invite-1')).resolves.toBeUndefined();
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'invite-1');
  });
});

// -----------------------------------------------------------------------
// peekInvite / acceptInvite
// -----------------------------------------------------------------------

describe('peekInvite', () => {
  it('calls the peek_invite RPC with the token', async () => {
    const peek = {
      group_id: 'group-1',
      group_name: 'Game Night',
      inviter_display_name: 'Ann',
      status: 'valid',
      expires_at: '2026-12-31T00:00:00Z',
    };
    const client = makeClient({ queryData: peek });
    const result = await peekInvite(client as never, 'tok');
    expect(result.status).toBe('valid');
    expect(client.rpc).toHaveBeenCalledWith('peek_invite', { p_token: 'tok' });
  });
});

describe('acceptInvite', () => {
  it('calls the accept_invite RPC and returns the group', async () => {
    const group = { id: 'group-1', name: 'Game Night' };
    const client = makeClient({ queryData: group });
    const result = await acceptInvite(client as never, 'tok');
    expect(result.name).toBe('Game Night');
    expect(client.rpc).toHaveBeenCalledWith('accept_invite', { p_token: 'tok' });
  });

  it.each([
    ['HD000', 'not_found'],
    ['HD001', 'expired'],
    ['HD002', 'already_used'],
    ['HD003', 'wrong_user'],
    ['HD004', 'already_member'],
  ])('classifies %s as %s via inviteErrorKind', async (code, kind) => {
    const client = makeClient({
      queryData: null,
      queryError: { code, message: 'invite error' },
    });
    let caught: unknown;
    try {
      await acceptInvite(client as never, 'tok');
    } catch (e) {
      caught = e;
    }
    expect(inviteErrorKind(caught)).toBe(kind);
  });

  it('inviteErrorKind returns null for unrelated errors', () => {
    expect(inviteErrorKind(new Error('plain'))).toBeNull();
  });
});

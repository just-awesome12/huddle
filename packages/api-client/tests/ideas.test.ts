import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupIdeas,
  fetchIdea,
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
  ideaQueryKeys,
} from '../src/ideas';

// -----------------------------------------------------------------------
// Minimal Supabase client mock factory
// -----------------------------------------------------------------------

function makeIdea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'idea-1',
    group_id: 'group-1',
    proposed_by: 'user-1',
    title: 'Taco night',
    description: null,
    category: 'food',
    link: null,
    photo_path: null,
    status: 'on_radar',
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
    proposer: { id: 'user-1', username: 'ann', display_name: 'Ann', avatar_url: null },
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
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
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

// -----------------------------------------------------------------------
// ideaQueryKeys
// -----------------------------------------------------------------------

describe('ideaQueryKeys', () => {
  it('embeds filters in the list key so combos cache independently', () => {
    expect(ideaQueryKeys.forGroup('g1', { status: 'done' })).toEqual([
      'groups',
      'g1',
      'ideas',
      { status: 'done', category: null },
    ]);
  });

  it('allForGroup is a prefix of every filtered key', () => {
    expect(ideaQueryKeys.allForGroup('g1')).toEqual(['groups', 'g1', 'ideas']);
  });
});

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

describe('fetchGroupIdeas', () => {
  it('lists ideas for the group, newest first', async () => {
    const client = makeClient({ queryData: [makeIdea()] });
    const result = await fetchGroupIdeas(client as never, 'group-1');
    expect(result).toHaveLength(1);
    expect(client._chain.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(client._chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('applies status and category filters when given', async () => {
    const client = makeClient({ queryData: [] });
    await fetchGroupIdeas(client as never, 'group-1', {
      status: 'on_radar',
      category: 'food',
    });
    expect(client._chain.eq).toHaveBeenCalledWith('status', 'on_radar');
    expect(client._chain.eq).toHaveBeenCalledWith('category', 'food');
  });

  it('omits filter clauses when no filters are given', async () => {
    const client = makeClient({ queryData: [] });
    await fetchGroupIdeas(client as never, 'group-1');
    const eqCalls = client._chain.eq.mock.calls.map((c) => c[0]);
    expect(eqCalls).toEqual(['group_id']);
  });

  it('maps errors through the HuddleError taxonomy', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(fetchGroupIdeas(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

describe('fetchIdea', () => {
  it('fetches a single idea with its proposer', async () => {
    const client = makeClient({ queryData: makeIdea() });
    const idea = await fetchIdea(client as never, 'idea-1');
    expect(idea.proposer?.username).toBe('ann');
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'idea-1');
  });
});

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

describe('createIdea', () => {
  it('inserts with proposed_by from the session', async () => {
    const client = makeClient({ queryData: makeIdea() });
    await createIdea(client as never, {
      groupId: 'group-1',
      title: 'Taco night',
      category: 'food',
    });
    expect(client._chain.insert).toHaveBeenCalledWith({
      group_id: 'group-1',
      proposed_by: 'user-1',
      title: 'Taco night',
      category: 'food',
      description: null,
      link: null,
    });
  });

  it('throws unauthorized when not signed in', async () => {
    const client = makeClient({ user: null as never });
    await expect(
      createIdea(client as never, { groupId: 'g', title: 't', category: 'food' }),
    ).rejects.toMatchObject({ huddle: { kind: 'unauthorized' } });
  });

  it('maps the title CHECK violation to validation', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '23514', message: 'ideas_title_length' },
    });
    await expect(
      createIdea(client as never, { groupId: 'g', title: ' ', category: 'food' }),
    ).rejects.toMatchObject({ huddle: { kind: 'validation' } });
  });
});

describe('updateIdea', () => {
  it('patches only the provided fields', async () => {
    const client = makeClient({ queryData: makeIdea({ title: 'New' }) });
    await updateIdea(client as never, 'idea-1', { title: 'New' });
    expect(client._chain.update).toHaveBeenCalledWith({ title: 'New' });
  });
});

describe('updateIdeaStatus', () => {
  it('updates just the status column', async () => {
    const client = makeClient({ queryData: makeIdea({ status: 'done' }) });
    const idea = await updateIdeaStatus(client as never, 'idea-1', 'done');
    expect(idea.status).toBe('done');
    expect(client._chain.update).toHaveBeenCalledWith({ status: 'done' });
  });
});

describe('deleteIdea', () => {
  it('deletes by id', async () => {
    const client = makeClient({ queryData: null });
    await expect(deleteIdea(client as never, 'idea-1')).resolves.toBeUndefined();
    expect(client._chain.delete).toHaveBeenCalled();
    expect(client._chain.eq).toHaveBeenCalledWith('id', 'idea-1');
  });

  it('maps RLS denial (non-proposer non-admin) to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(deleteIdea(client as never, 'idea-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

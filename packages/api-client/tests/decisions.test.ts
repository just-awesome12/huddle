import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupDecisions,
  runPicker,
  decisionQueryKeys,
} from '../src/decisions';

// -----------------------------------------------------------------------
// Minimal Supabase client mock
// -----------------------------------------------------------------------

function makeDecision(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dec-1',
    group_id: 'group-1',
    run_by: 'user-1',
    chosen_idea_id: 'idea-1',
    candidate_idea_ids: ['idea-1', 'idea-2'],
    filters: { category: null, shortlist: null },
    created_at: '2026-06-17T00:00:00Z',
    runner: { id: 'user-1', username: 'ann', display_name: 'Ann', avatar_url: null },
    chosen: { id: 'idea-1', title: 'Pizza', category: 'food', status: 'on_radar' },
    ...overrides,
  };
}

function makeClient({
  queryData = null as unknown,
  queryError = null as unknown,
  invokeResult = { data: null as unknown, error: null as unknown },
} = {}) {
  const result = { data: queryData, error: queryError };
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  return {
    from: vi.fn().mockReturnValue(fromChain),
    functions: {
      invoke: vi.fn().mockResolvedValue(invokeResult),
    },
    _chain: fromChain,
  };
}

// -----------------------------------------------------------------------
// decisionQueryKeys
// -----------------------------------------------------------------------

describe('decisionQueryKeys', () => {
  it('scopes decision lists under the group key', () => {
    expect(decisionQueryKeys.forGroup('g1')).toEqual(['groups', 'g1', 'decisions']);
  });
});

// -----------------------------------------------------------------------
// fetchGroupDecisions
// -----------------------------------------------------------------------

describe('fetchGroupDecisions', () => {
  it('lists a group\'s decisions newest-first with runner + chosen embedded', async () => {
    const client = makeClient({ queryData: [makeDecision()] });
    const result = await fetchGroupDecisions(client as never, 'group-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.chosen?.title).toBe('Pizza');
    expect(result[0]?.runner?.username).toBe('ann');
    expect(client._chain.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(client._chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] for empty data', async () => {
    const client = makeClient({ queryData: null });
    await expect(fetchGroupDecisions(client as never, 'group-1')).resolves.toEqual([]);
  });

  it('maps an RLS denial to unauthorized', async () => {
    const client = makeClient({
      queryData: null,
      queryError: { code: '42501', message: 'denied' },
    });
    await expect(fetchGroupDecisions(client as never, 'group-1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

// -----------------------------------------------------------------------
// runPicker
// -----------------------------------------------------------------------

describe('runPicker', () => {
  it('invokes run-picker with the normalised body and returns a pick', async () => {
    const decision = makeDecision();
    const client = makeClient({
      invokeResult: { data: { outcome: 'picked', decision }, error: null },
    });
    const result = await runPicker(client as never, {
      groupId: 'group-1',
      category: 'food',
    });
    expect(result).toEqual({ outcome: 'picked', decision });
    expect(client.functions.invoke).toHaveBeenCalledWith('run-picker', {
      body: { groupId: 'group-1', category: 'food', shortlist: null },
    });
  });

  it('passes a shortlist through and defaults the absent category to null', async () => {
    const client = makeClient({
      invokeResult: { data: { outcome: 'no_candidates' }, error: null },
    });
    await runPicker(client as never, {
      groupId: 'group-1',
      shortlist: ['idea-1', 'idea-2'],
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('run-picker', {
      body: { groupId: 'group-1', category: null, shortlist: ['idea-1', 'idea-2'] },
    });
  });

  it('returns the no_candidates empty state without throwing', async () => {
    const client = makeClient({
      invokeResult: { data: { outcome: 'no_candidates' }, error: null },
    });
    await expect(runPicker(client as never, { groupId: 'group-1' })).resolves.toEqual({
      outcome: 'no_candidates',
    });
  });

  it('maps a 403 (not a member) from the function body to unauthorized', async () => {
    const client = makeClient({
      invokeResult: {
        data: null,
        error: {
          name: 'FunctionsHttpError',
          context: {
            status: 403,
            json: async () => ({ error: { code: 'not_member', message: 'Not a member' } }),
          },
        },
      },
    });
    await expect(runPicker(client as never, { groupId: 'group-1' })).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });

  it('still throws when the error body is not our JSON shape', async () => {
    const client = makeClient({
      invokeResult: {
        data: null,
        error: {
          name: 'FunctionsHttpError',
          context: {
            status: 500,
            json: async () => {
              throw new Error('not json');
            },
          },
        },
      },
    });
    await expect(runPicker(client as never, { groupId: 'group-1' })).rejects.toBeInstanceOf(Error);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupDecisions,
  fetchGroupFairness,
  runPicker,
  PickerError,
  decisionQueryKeys,
} from '../src/decisions';

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

function makeReadClient(queryData: unknown, queryError: unknown = null) {
  const result = { data: queryData, error: queryError };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  } as never;
}

function makeFnClient(invoke: () => Promise<{ data: unknown; error: unknown }>) {
  return {
    functions: { invoke: vi.fn(invoke) },
  } as never;
}

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

describe('fetchGroupDecisions', () => {
  it('queries the group, newest first, and returns the rows', async () => {
    const rows = [{ id: 'd1', group_id: 'g1' }];
    const client = makeReadClient(rows);
    const out = await fetchGroupDecisions(client, 'g1');

    expect(out).toBe(rows);
    const c = (client as unknown as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;
    expect(c.eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] when there are no decisions', async () => {
    const client = makeReadClient(null);
    expect(await fetchGroupDecisions(client, 'g1')).toEqual([]);
  });
});

describe('decisionQueryKeys', () => {
  it('scopes history by group', () => {
    expect(decisionQueryKeys.forGroup('g1')).toEqual(['groups', 'g1', 'decisions']);
  });
});

describe('fetchGroupFairness', () => {
  // Each .from(table).select(...).eq(...) resolves to that table's rows.
  function makeClient(byTable: Record<string, unknown[]>) {
    return {
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => Promise.resolve({ data: byTable[table] ?? [], error: null }),
        };
        return builder;
      },
    } as never;
  }

  it('tallies proposed vs picked per member, most-picked first', async () => {
    const client = makeClient({
      group_members: [
        { user_id: 'u1', profiles: { username: 'alice', display_name: 'Alice' } },
        { user_id: 'u2', profiles: { username: 'bob', display_name: 'Bob' } },
      ],
      ideas: [
        { id: 'i1', proposed_by: 'u1' },
        { id: 'i2', proposed_by: 'u1' },
        { id: 'i3', proposed_by: 'u2' },
      ],
      decisions: [{ chosen_idea_id: 'i1' }, { chosen_idea_id: 'i1' }],
    });

    const out = await fetchGroupFairness(client, 'g1');
    expect(out).toEqual([
      { userId: 'u1', displayName: 'Alice', username: 'alice', proposed: 2, picked: 2 },
      { userId: 'u2', displayName: 'Bob', username: 'bob', proposed: 1, picked: 0 },
    ]);
  });

  it('lists a member with no ideas as proposed 0 / picked 0', async () => {
    const client = makeClient({
      group_members: [{ user_id: 'u9', profiles: { username: 'zoe', display_name: 'Zoe' } }],
      ideas: [],
      decisions: [],
    });
    expect(await fetchGroupFairness(client, 'g1')).toEqual([
      { userId: 'u9', displayName: 'Zoe', username: 'zoe', proposed: 0, picked: 0 },
    ]);
  });
});

// -----------------------------------------------------------------------
// runPicker
// -----------------------------------------------------------------------

describe('runPicker', () => {
  it('invokes run_picker with the normalised body and returns the result', async () => {
    const decision = { id: 'd1', group_id: 'g1', chosen_idea_id: 'i2' };
    const client = makeFnClient(async () => ({
      data: { decision, chosenIdeaId: 'i2' },
      error: null,
    }));

    const out = await runPicker(client, {
      groupId: 'g1',
      category: 'food',
      shortlist: ['i1', 'i2'],
    });

    expect(out).toEqual({ decision, chosenIdeaId: 'i2' });
    const invoke = (client as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } })
      .functions.invoke;
    expect(invoke).toHaveBeenCalledWith('run_picker', {
      body: {
        groupId: 'g1',
        fair: false,
        filters: { category: 'food', shortlist: ['i1', 'i2'], fair: false },
      },
    });
  });

  it('passes fair mode through when requested', async () => {
    const client = makeFnClient(async () => ({
      data: { decision: { id: 'd1' }, chosenIdeaId: 'i1' },
      error: null,
    }));
    await runPicker(client, { groupId: 'g1', fair: true });
    const invoke = (client as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } })
      .functions.invoke;
    expect(invoke).toHaveBeenCalledWith('run_picker', {
      body: {
        groupId: 'g1',
        fair: true,
        filters: { category: null, shortlist: null, fair: true },
      },
    });
  });

  it('defaults category/shortlist to null when omitted', async () => {
    const client = makeFnClient(async () => ({
      data: { decision: { id: 'd1' }, chosenIdeaId: 'i1' },
      error: null,
    }));
    await runPicker(client, { groupId: 'g1' });
    const invoke = (client as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } })
      .functions.invoke;
    expect(invoke).toHaveBeenCalledWith('run_picker', {
      body: {
        groupId: 'g1',
        fair: false,
        filters: { category: null, shortlist: null, fair: false },
      },
    });
  });

  it('maps a FunctionsHttpError body to a typed PickerError (with count)', async () => {
    const httpError = {
      name: 'FunctionsHttpError',
      context: { json: async () => ({ error: 'too_few_candidates', count: 1 }) },
    };
    const client = makeFnClient(async () => ({ data: null, error: httpError }));

    await expect(runPicker(client, { groupId: 'g1' })).rejects.toMatchObject({
      code: 'too_few_candidates',
      count: 1,
    });
    await expect(runPicker(client, { groupId: 'g1' })).rejects.toBeInstanceOf(PickerError);
  });

  it('falls back to internal when the error body is unreadable', async () => {
    const client = makeFnClient(async () => ({ data: null, error: { name: 'X' } }));
    await expect(runPicker(client, { groupId: 'g1' })).rejects.toMatchObject({
      code: 'internal',
    });
  });

  it('treats a structured error in the data payload as a failure', async () => {
    const client = makeFnClient(async () => ({
      data: { error: 'forbidden' },
      error: null,
    }));
    await expect(runPicker(client, { groupId: 'g1' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('throws internal when the success payload has no decision', async () => {
    const client = makeFnClient(async () => ({ data: {}, error: null }));
    await expect(runPicker(client, { groupId: 'g1' })).rejects.toMatchObject({
      code: 'internal',
    });
  });
});

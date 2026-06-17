import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupDecisions,
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
      body: { groupId: 'g1', filters: { category: 'food', shortlist: ['i1', 'i2'] } },
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
      body: { groupId: 'g1', filters: { category: null, shortlist: null } },
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

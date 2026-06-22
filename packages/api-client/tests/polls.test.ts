import { describe, expect, it, vi } from 'vitest';
import { fetchGroupPolls, createPoll, castVote, pollQueryKeys } from '../src/polls';

/** Table-keyed mock: each .from(table) resolves to that table's rows. */
function makeClient({
  polls = [] as unknown[],
  options = [] as unknown[],
  votes = [] as unknown[],
  user = 'me',
} = {}) {
  const data: Record<string, unknown[]> = {
    polls,
    poll_options: options,
    poll_votes: votes,
  };
  const inserted: Record<string, unknown> = {};
  const from = vi.fn((table: string) => {
    const result = { data: data[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => Promise.resolve(result),
      single: () => Promise.resolve({ data: { id: 'poll1' }, error: null }),
      insert: (rows: unknown) => {
        inserted[table] = rows;
        return chain;
      },
      upsert: (rows: unknown) => {
        inserted[`${table}:upsert`] = rows;
        return Promise.resolve({ error: null });
      },
      delete: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  });
  return {
    client: { auth: { getUser: () => ({ data: { user: { id: user } } }) }, from },
    inserted,
  };
}

describe('pollQueryKeys', () => {
  it('keys the list under the group', () => {
    expect(pollQueryKeys.list('g1')).toEqual(['groups', 'g1', 'polls']);
  });
});

describe('fetchGroupPolls', () => {
  it('aggregates per-option counts, totals, and the caller’s vote', async () => {
    const { client } = makeClient({
      polls: [
        {
          id: 'p1',
          group_id: 'g1',
          question: 'Pizza or sushi?',
          created_by: 'u2',
          closed_at: null,
          created_at: 't',
        },
      ],
      options: [
        { id: 'o1', poll_id: 'p1', label: 'Pizza', position: 0 },
        { id: 'o2', poll_id: 'p1', label: 'Sushi', position: 1 },
      ],
      votes: [
        { poll_id: 'p1', option_id: 'o1', user_id: 'me' },
        { poll_id: 'p1', option_id: 'o1', user_id: 'u2' },
        { poll_id: 'p1', option_id: 'o2', user_id: 'u3' },
      ],
      user: 'me',
    });

    const poll = (await fetchGroupPolls(client as never, 'g1', 'me'))[0]!;
    expect(poll.question).toBe('Pizza or sushi?');
    expect(poll.totalVotes).toBe(3);
    expect(poll.options.map((o) => [o.label, o.count])).toEqual([
      ['Pizza', 2],
      ['Sushi', 1],
    ]);
    expect(poll.myOptionId).toBe('o1');
  });

  it('reports no vote when the caller hasn’t voted', async () => {
    const { client } = makeClient({
      polls: [
        {
          id: 'p1',
          group_id: 'g1',
          question: 'Q',
          created_by: 'u2',
          closed_at: null,
          created_at: 't',
        },
      ],
      options: [{ id: 'o1', poll_id: 'p1', label: 'A', position: 0 }],
      votes: [{ poll_id: 'p1', option_id: 'o1', user_id: 'someone-else' }],
      user: 'me',
    });
    const poll = (await fetchGroupPolls(client as never, 'g1', 'me'))[0]!;
    expect(poll.myOptionId).toBeNull();
    expect(poll.totalVotes).toBe(1);
  });
});

describe('createPoll', () => {
  it('inserts the poll then its options with positions', async () => {
    const { client, inserted } = makeClient();
    await createPoll(client as never, {
      groupId: 'g1',
      question: 'Pick one',
      options: ['A', 'B', 'C'],
    });
    expect(inserted.polls).toMatchObject({
      group_id: 'g1',
      created_by: 'me',
      question: 'Pick one',
    });
    expect(inserted.poll_options).toEqual([
      { poll_id: 'poll1', group_id: 'g1', label: 'A', position: 0 },
      { poll_id: 'poll1', group_id: 'g1', label: 'B', position: 1 },
      { poll_id: 'poll1', group_id: 'g1', label: 'C', position: 2 },
    ]);
  });
});

describe('castVote', () => {
  it('upserts on the (poll, user) conflict key', async () => {
    const { client, inserted } = makeClient();
    await castVote(client as never, { pollId: 'p1', groupId: 'g1', optionId: 'o2' });
    expect(inserted['poll_votes:upsert']).toMatchObject({
      poll_id: 'p1',
      group_id: 'g1',
      option_id: 'o2',
      user_id: 'me',
    });
  });
});

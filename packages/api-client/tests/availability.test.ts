import { describe, expect, it, vi } from 'vitest';
import {
  fetchGroupAvailabilityPolls,
  createAvailabilityPoll,
  setAvailability,
  availabilityQueryKeys,
} from '../src/availability';

/** Table-keyed mock: each .from(table) resolves to that table's rows. */
function makeClient({
  polls = [] as unknown[],
  dates = [] as unknown[],
  responses = [] as unknown[],
  user = 'me',
} = {}) {
  const data: Record<string, unknown[]> = {
    availability_polls: polls,
    availability_dates: dates,
    availability_responses: responses,
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

describe('availabilityQueryKeys', () => {
  it('keys the list under the group', () => {
    expect(availabilityQueryKeys.list('g1')).toEqual(['groups', 'g1', 'availability']);
  });
});

describe('fetchGroupAvailabilityPolls', () => {
  it('tallies yes/maybe/no per date, the caller’s status, and respondents', async () => {
    const { client } = makeClient({
      polls: [
        {
          id: 'p1',
          group_id: 'g1',
          title: 'Dinner?',
          created_by: 'u2',
          closed_at: null,
          created_at: 't',
        },
      ],
      dates: [
        { id: 'd1', poll_id: 'p1', event_date: '2026-07-01', position: 0 },
        { id: 'd2', poll_id: 'p1', event_date: '2026-07-02', position: 1 },
      ],
      responses: [
        { date_id: 'd1', poll_id: 'p1', user_id: 'me', status: 'yes' },
        { date_id: 'd1', poll_id: 'p1', user_id: 'u2', status: 'yes' },
        { date_id: 'd1', poll_id: 'p1', user_id: 'u3', status: 'no' },
        { date_id: 'd2', poll_id: 'p1', user_id: 'me', status: 'maybe' },
      ],
      user: 'me',
    });

    const poll = (await fetchGroupAvailabilityPolls(client as never, 'g1', 'me'))[0]!;
    expect(poll.title).toBe('Dinner?');
    expect(poll.respondentCount).toBe(3); // me, u2, u3
    const [d1, d2] = poll.dates;
    expect([d1!.yes, d1!.maybe, d1!.no]).toEqual([2, 0, 1]);
    expect(d1!.myStatus).toBe('yes');
    expect([d2!.yes, d2!.maybe, d2!.no]).toEqual([0, 1, 0]);
    expect(d2!.myStatus).toBe('maybe');
  });
});

describe('createAvailabilityPoll', () => {
  it('inserts the poll then its dates, sorted, with positions', async () => {
    const { client, inserted } = makeClient();
    await createAvailabilityPoll(client as never, {
      groupId: 'g1',
      title: 'When?',
      dates: ['2026-07-03', '2026-07-01'],
    });
    expect(inserted.availability_polls).toMatchObject({
      group_id: 'g1',
      created_by: 'me',
      title: 'When?',
    });
    // Dates are sorted ascending before insert.
    expect(inserted.availability_dates).toEqual([
      { poll_id: 'poll1', group_id: 'g1', event_date: '2026-07-01', position: 0 },
      { poll_id: 'poll1', group_id: 'g1', event_date: '2026-07-03', position: 1 },
    ]);
  });
});

describe('setAvailability', () => {
  it('upserts on the (date,user) conflict key', async () => {
    const { client, inserted } = makeClient();
    await setAvailability(client as never, {
      pollId: 'p1',
      dateId: 'd1',
      groupId: 'g1',
      status: 'maybe',
    });
    expect(inserted['availability_responses:upsert']).toMatchObject({
      date_id: 'd1',
      poll_id: 'p1',
      group_id: 'g1',
      user_id: 'me',
      status: 'maybe',
    });
  });
});

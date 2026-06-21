import { describe, expect, it } from 'vitest';
import { fetchGroupActivity, activityQueryKeys } from '../src/activity';

/**
 * fetchGroupActivity merges five sources into one sorted feed. The mock
 * returns per-table data; each query chain resolves to its table's rows.
 */
function makeClient(dataByTable: Record<string, unknown[]>, errorTable?: string) {
  return {
    from(table: string) {
      const result =
        errorTable === table
          ? { data: null, error: { code: '42501', message: 'denied' } }
          : { data: dataByTable[table] ?? [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return chain;
    },
  };
}

const prof = (name: string) => ({ display_name: name });

describe('activityQueryKeys', () => {
  it('scopes the feed by group id', () => {
    expect(activityQueryKeys.feed('g1')).toEqual(['groups', 'g1', 'activity']);
  });
});

describe('fetchGroupActivity', () => {
  it('merges all sources, newest first, capped at limit', async () => {
    const client = makeClient({
      ideas: [
        {
          id: 'i1',
          title: 'Tacos',
          proposed_by: 'u1',
          created_at: '2026-01-05T00:00:00Z',
          profiles: prof('Alice'),
        },
      ],
      idea_votes: [
        {
          user_id: 'u2',
          created_at: '2026-01-06T00:00:00Z',
          ideas: { id: 'i1', title: 'Tacos', group_id: 'g1' },
          profiles: prof('Bob'),
        },
      ],
      idea_comments: [
        {
          id: 'c1',
          idea_id: 'i1',
          body: 'yum',
          author_id: 'u2',
          created_at: '2026-01-07T00:00:00Z',
          ideas: { title: 'Tacos' },
          profiles: prof('Bob'),
        },
      ],
      decisions: [
        {
          id: 'd1',
          chosen_idea_id: 'i1',
          run_by: 'u1',
          created_at: '2026-01-08T00:00:00Z',
          ideas: { title: 'Tacos' },
          profiles: prof('Alice'),
        },
      ],
      group_members: [
        { user_id: 'u3', joined_at: '2026-01-04T00:00:00Z', profiles: prof('Carol') },
      ],
    });

    const feed = await fetchGroupActivity(client as never, 'g1', 20);
    expect(feed.map((i) => i.kind)).toEqual([
      'picker_ran', // 01-08
      'comment_added', // 01-07
      'idea_voted', // 01-06
      'idea_added', // 01-05
      'member_joined', // 01-04
    ]);
    expect(feed[0]!.actorName).toBe('Alice');
    expect(feed[0]!.ideaTitle).toBe('Tacos');
    expect(feed.find((i) => i.kind === 'comment_added')!.snippet).toBe('yum');
  });

  it('caps the merged feed at the limit', async () => {
    const ideas = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      title: `Idea ${i}`,
      proposed_by: 'u1',
      created_at: `2026-01-0${i + 1}T00:00:00Z`,
      profiles: prof('Alice'),
    }));
    const client = makeClient({ ideas });
    const feed = await fetchGroupActivity(client as never, 'g1', 3);
    expect(feed).toHaveLength(3);
    // Newest three.
    expect(feed[0]!.id).toBe('idea_added:i4');
  });

  it('falls back to "Someone" for de-attributed actors', async () => {
    const client = makeClient({
      ideas: [
        {
          id: 'i1',
          title: 'Orphan',
          proposed_by: null,
          created_at: '2026-01-01T00:00:00Z',
          profiles: null,
        },
      ],
    });
    const feed = await fetchGroupActivity(client as never, 'g1');
    expect(feed[0]!.actorName).toBe('Someone');
    expect(feed[0]!.actorId).toBeNull();
  });

  it('throws a HuddleError if any source query fails', async () => {
    const client = makeClient({ ideas: [] }, 'decisions');
    await expect(fetchGroupActivity(client as never, 'g1')).rejects.toMatchObject({
      huddle: { kind: 'unauthorized' },
    });
  });
});

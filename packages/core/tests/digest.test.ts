import { describe, expect, it } from 'vitest';
import {
  buildDigestEmail,
  groupSummaryLines,
  type DigestGroup,
  type UserDigest,
} from '../src/digest';
import * as mirror from '../../../supabase/functions/_shared/digest.ts';

const emptyGroup = (over: Partial<DigestGroup> = {}): DigestGroup => ({
  group_id: 'g1',
  name: 'Foodies',
  new_ideas: [],
  decisions: 0,
  comments: 0,
  posts: 0,
  upcoming: [],
  ...over,
});

describe('groupSummaryLines', () => {
  it('summarizes each activity kind with pluralization', () => {
    const lines = groupSummaryLines(
      emptyGroup({ new_ideas: ['Tacos'], decisions: 2, comments: 1, posts: 3 }),
    );
    expect(lines).toEqual([
      '1 new idea: Tacos',
      '2 decisions made',
      '1 new comment',
      '3 wall posts',
    ]);
  });

  it('caps shown idea titles at 5 and notes the overflow', () => {
    const titles = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const [line] = groupSummaryLines(emptyGroup({ new_ideas: titles }));
    expect(line).toBe('7 new ideas: a, b, c, d, e, +2 more');
  });

  it('lists upcoming events (capped at 3)', () => {
    const lines = groupSummaryLines(
      emptyGroup({
        upcoming: [
          { title: 'Dinner', date: '2026-07-01' },
          { title: 'Movie', date: '2026-07-02' },
          { title: 'Hike', date: '2026-07-03' },
          { title: 'Trip', date: '2026-07-04' },
        ],
      }),
    );
    expect(lines).toEqual(['Upcoming: Dinner (2026-07-01), Movie (2026-07-02), Hike (2026-07-03)']);
  });

  it('returns no lines when nothing happened', () => {
    expect(groupSummaryLines(emptyGroup())).toEqual([]);
  });
});

describe('buildDigestEmail', () => {
  const digest: UserDigest = {
    email: 'a@b.test',
    displayName: 'Sam',
    groups: [
      emptyGroup({ name: 'Foodies', new_ideas: ['Tacos', 'Ramen'], comments: 4 }),
      emptyGroup({ group_id: 'g2', name: 'Roommates', decisions: 1 }),
    ],
  };

  it('subjects a multi-group recap with the count', () => {
    expect(buildDigestEmail(digest).subject).toBe('Your Huddle weekly recap (2 groups)');
  });

  it('subjects a single-group recap with the group name', () => {
    const one = buildDigestEmail({ ...digest, groups: [digest.groups[0]!] });
    expect(one.subject).toBe('Your week in Foodies');
  });

  it('includes greeting, group names, activity, and a manage-prefs footer', () => {
    const { text, html } = buildDigestEmail(digest);
    expect(text).toContain('Hi Sam,');
    expect(text).toContain('## Foodies');
    expect(text).toContain('2 new ideas: Tacos, Ramen');
    expect(text).toContain('## Roommates');
    expect(text).toMatch(/turn off these weekly emails/i);
    expect(html).toContain('Foodies');
    expect(html).toContain('Open Huddle');
  });

  it('falls back to a generic greeting without a display name', () => {
    expect(buildDigestEmail({ ...digest, displayName: null }).text).toContain('Hi there,');
  });

  it('HTML-escapes group names', () => {
    const evil = buildDigestEmail({
      ...digest,
      groups: [emptyGroup({ name: '<script>x</script>', decisions: 1 })],
    });
    expect(evil.html).toContain('&lt;script&gt;');
    expect(evil.html).not.toContain('<script>x');
  });
});

describe('Deno mirror drift guard', () => {
  const samples: UserDigest[] = [
    {
      email: 'a@b.test',
      displayName: 'Sam',
      groups: [
        emptyGroup({
          name: 'Foodies',
          new_ideas: ['Tacos', 'Ramen', 'Pho'],
          comments: 4,
          posts: 2,
        }),
        emptyGroup({
          group_id: 'g2',
          name: 'Roommates',
          decisions: 1,
          upcoming: [{ title: 'Rent due', date: '2026-07-01' }],
        }),
      ],
    },
    {
      email: 'c@d.test',
      displayName: null,
      groups: [emptyGroup({ name: 'Solo', new_ideas: ['x'] })],
    },
  ];

  it('buildDigestEmail matches the mirror', () => {
    for (const s of samples) {
      expect(buildDigestEmail(s)).toEqual(mirror.buildDigestEmail(s));
    }
  });

  it('groupSummaryLines matches the mirror', () => {
    for (const s of samples) {
      for (const g of s.groups) {
        expect(groupSummaryLines(g)).toEqual(mirror.groupSummaryLines(g));
      }
    }
  });
});

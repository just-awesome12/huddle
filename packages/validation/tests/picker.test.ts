import { describe, expect, it } from 'vitest';
import { pickerOptionsSchema } from '../src/picker';

const GROUP = '11111111-1111-1111-1111-111111111111';
const IDEA_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const IDEA_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('pickerOptionsSchema', () => {
  it('accepts a bare groupId (no filters)', () => {
    expect(pickerOptionsSchema.parse({ groupId: GROUP })).toEqual({ groupId: GROUP });
  });

  it('accepts a category filter', () => {
    const parsed = pickerOptionsSchema.parse({ groupId: GROUP, category: 'food' });
    expect(parsed.category).toBe('food');
  });

  it('rejects an unknown category', () => {
    expect(() =>
      pickerOptionsSchema.parse({ groupId: GROUP, category: 'drinks' }),
    ).toThrow();
  });

  it('accepts a shortlist of idea ids', () => {
    const parsed = pickerOptionsSchema.parse({
      groupId: GROUP,
      shortlist: [IDEA_A, IDEA_B],
    });
    expect(parsed.shortlist).toEqual([IDEA_A, IDEA_B]);
  });

  it('rejects an empty shortlist (omit the field instead)', () => {
    expect(() =>
      pickerOptionsSchema.parse({ groupId: GROUP, shortlist: [] }),
    ).toThrow(/at least one/i);
  });

  it('rejects a shortlist containing a non-uuid', () => {
    expect(() =>
      pickerOptionsSchema.parse({ groupId: GROUP, shortlist: [IDEA_A, 'not-a-uuid'] }),
    ).toThrow();
  });

  it('rejects a non-uuid groupId', () => {
    expect(() => pickerOptionsSchema.parse({ groupId: 'nope' })).toThrow(/group id/i);
  });
});

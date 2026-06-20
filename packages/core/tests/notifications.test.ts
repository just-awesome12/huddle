import { describe, expect, it } from 'vitest';
import {
  shouldNotify,
  selectRecipientTokens,
  buildExpoMessages,
  chunk,
  DEFAULT_PREFS,
  type NotificationPrefs,
  type Recipient,
} from '../src/notifications';
import * as mirror from '../../../supabase/functions/_shared/notifications.ts';

const allOff: NotificationPrefs = {
  new_idea: false,
  picker_ran: false,
  group_invite: false,
  new_comment: false,
  join_request: false,
  join_approved: false,
};

describe('shouldNotify', () => {
  it('treats a missing prefs row as opted-in to everything', () => {
    expect(shouldNotify(null, 'new_idea')).toBe(true);
    expect(shouldNotify(undefined, 'picker_ran')).toBe(true);
    expect(DEFAULT_PREFS.group_invite).toBe(true);
  });

  it('honours per-event opt-out', () => {
    expect(shouldNotify({ ...DEFAULT_PREFS, new_idea: false }, 'new_idea')).toBe(false);
    expect(shouldNotify({ ...DEFAULT_PREFS, new_idea: false }, 'picker_ran')).toBe(true);
    expect(shouldNotify(allOff, 'group_invite')).toBe(false);
  });
});

describe('selectRecipientTokens', () => {
  const recipients: Recipient[] = [
    { userId: 'actor', expoToken: 'tok-actor', prefs: null },
    { userId: 'u1', expoToken: 'tok-u1a', prefs: null },
    { userId: 'u1', expoToken: 'tok-u1b', prefs: null }, // second device
    { userId: 'u2', expoToken: 'tok-u2', prefs: { ...DEFAULT_PREFS, new_idea: false } },
  ];

  it('excludes the actor and includes all of a recipient’s devices', () => {
    expect(selectRecipientTokens(recipients, 'new_idea', 'actor')).toEqual(['tok-u1a', 'tok-u1b']); // u2 opted out of new_idea, actor excluded
  });

  it('respects per-event prefs (u2 still gets picker_ran)', () => {
    expect(selectRecipientTokens(recipients, 'picker_ran', 'actor')).toEqual([
      'tok-u1a',
      'tok-u1b',
      'tok-u2',
    ]);
  });

  it('with no actor (null) keeps everyone eligible', () => {
    expect(selectRecipientTokens(recipients, 'group_invite', null)).toEqual([
      'tok-actor',
      'tok-u1a',
      'tok-u1b',
      'tok-u2',
    ]);
  });
});

describe('buildExpoMessages', () => {
  it('builds one message per token with sound and optional data', () => {
    const msgs = buildExpoMessages(['a', 'b'], {
      title: 'New idea',
      body: 'Tacos',
      data: { path: '/groups/g1' },
    });
    expect(msgs).toEqual([
      { to: 'a', title: 'New idea', body: 'Tacos', sound: 'default', data: { path: '/groups/g1' } },
      { to: 'b', title: 'New idea', body: 'Tacos', sound: 'default', data: { path: '/groups/g1' } },
    ]);
  });

  it('omits the data key when none is provided', () => {
    const [msg] = buildExpoMessages(['a'], { title: 'T', body: 'B' });
    expect(msg).not.toHaveProperty('data');
  });
});

describe('chunk', () => {
  it('splits into chunks of at most size, last possibly smaller', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
  it('throws on a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('Deno mirror drift guard', () => {
  const recipients: Recipient[] = [
    { userId: 'a', expoToken: 't-a', prefs: null },
    {
      userId: 'b',
      expoToken: 't-b',
      prefs: {
        new_idea: false,
        picker_ran: true,
        group_invite: true,
        new_comment: false,
        join_request: true,
        join_approved: false,
      },
    },
  ];
  it('selectRecipientTokens matches the mirror', () => {
    for (const ev of [
      'new_idea',
      'picker_ran',
      'group_invite',
      'new_comment',
      'join_request',
      'join_approved',
    ] as const) {
      expect(selectRecipientTokens(recipients, ev, 'a')).toEqual(
        mirror.selectRecipientTokens(recipients, ev, 'a'),
      );
    }
  });
  it('buildExpoMessages and chunk match the mirror', () => {
    const content = { title: 'T', body: 'B', data: { x: 1 } };
    expect(buildExpoMessages(['a', 'b'], content)).toEqual(
      mirror.buildExpoMessages(['a', 'b'], content),
    );
    expect(chunk([1, 2, 3], 2)).toEqual(mirror.chunk([1, 2, 3], 2));
  });
});

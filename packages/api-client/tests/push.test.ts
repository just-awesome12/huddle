import { describe, expect, it, vi } from 'vitest';
import {
  registerPushToken,
  removePushToken,
  fetchNotificationPrefs,
  upsertNotificationPrefs,
  notificationQueryKeys,
} from '../src/push';

function makeClient({
  user = { id: 'user-1' },
  data = null as unknown,
  error = null as unknown,
} = {}) {
  const result = { data, error };
  const chain = {
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    // terminal awaits (delete/upsert without select) resolve via then
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
  return client as never;
}

const chainOf = (c: unknown) =>
  (c as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;

describe('registerPushToken', () => {
  it('upserts the caller’s token keyed on (user, token)', async () => {
    const client = makeClient();
    await registerPushToken(client, { expoToken: 'ExponentPushToken[abc]', platform: 'ios' });
    const c = chainOf(client);
    expect(c.upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = c.upsert!.mock.calls[0]!;
    expect(row).toMatchObject({
      user_id: 'user-1',
      expo_token: 'ExponentPushToken[abc]',
      platform: 'ios',
    });
    expect(opts).toEqual({ onConflict: 'user_id,expo_token' });
  });
});

describe('removePushToken', () => {
  it('deletes by token', async () => {
    const client = makeClient();
    await removePushToken(client, 'ExponentPushToken[abc]');
    const c = chainOf(client);
    expect(c.delete).toHaveBeenCalledTimes(1);
    expect(c.eq).toHaveBeenCalledWith('expo_token', 'ExponentPushToken[abc]');
  });
});

describe('fetchNotificationPrefs', () => {
  it('returns the row when present', async () => {
    const row = { user_id: 'user-1', new_idea: false, picker_ran: true, group_invite: true };
    const client = makeClient({ data: row });
    expect(await fetchNotificationPrefs(client, 'user-1')).toEqual(row);
    expect(chainOf(client).eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('returns null when there is no row (defaults apply)', async () => {
    const client = makeClient({ data: null });
    expect(await fetchNotificationPrefs(client, 'user-1')).toBeNull();
  });
});

describe('upsertNotificationPrefs', () => {
  it('upserts the caller’s prefs keyed on user_id', async () => {
    const row = { user_id: 'user-1', new_idea: false, picker_ran: true, group_invite: false };
    const client = makeClient({ data: row });
    const out = await upsertNotificationPrefs(client, {
      new_idea: false,
      picker_ran: true,
      group_invite: false,
    });
    expect(out).toEqual(row);
    const c = chainOf(client);
    const [body, opts] = c.upsert!.mock.calls[0]!;
    expect(body).toMatchObject({ user_id: 'user-1', new_idea: false, group_invite: false });
    expect(opts).toEqual({ onConflict: 'user_id' });
  });
});

describe('notificationQueryKeys', () => {
  it('scopes prefs by user', () => {
    expect(notificationQueryKeys.prefs('user-1')).toEqual(['notification-prefs', 'user-1']);
  });
});

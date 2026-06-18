import { describe, expect, it, vi } from 'vitest';
import { deleteAccount, SoleAdminError, AccountDeletionError } from '../src/account';

function makeClient(invoke: () => Promise<{ data: unknown; error: unknown }>) {
  return { functions: { invoke: vi.fn(invoke) } } as never;
}

describe('deleteAccount', () => {
  it('resolves and invokes delete-account on success', async () => {
    const client = makeClient(async () => ({ data: { ok: true }, error: null }));
    await expect(deleteAccount(client)).resolves.toBeUndefined();
    const invoke = (client as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } })
      .functions.invoke;
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  it('throws SoleAdminError with the blocking groups (FunctionsHttpError)', async () => {
    const groups = [{ id: 'g1', name: 'Roomies' }];
    const httpError = {
      name: 'FunctionsHttpError',
      context: { json: async () => ({ error: 'sole_admin', groups }) },
    };
    const client = makeClient(async () => ({ data: null, error: httpError }));

    const err = await deleteAccount(client).catch((e) => e);
    expect(err).toBeInstanceOf(SoleAdminError);
    expect((err as SoleAdminError).groups).toEqual(groups);
  });

  it('handles a structured error surfaced in the data payload', async () => {
    const client = makeClient(async () => ({
      data: { error: 'sole_admin', groups: [{ id: 'g2', name: 'Crew' }] },
      error: null,
    }));
    const err = await deleteAccount(client).catch((e) => e);
    expect(err).toBeInstanceOf(SoleAdminError);
    expect((err as SoleAdminError).groups[0]?.name).toBe('Crew');
  });

  it('throws AccountDeletionError on a generic failure', async () => {
    const client = makeClient(async () => ({ data: null, error: { name: 'X' } }));
    await expect(deleteAccount(client)).rejects.toBeInstanceOf(AccountDeletionError);
  });
});

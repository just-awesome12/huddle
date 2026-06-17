import { type HuddleClient } from './internal';

/**
 * Account deletion (Phase 10, OQ-6) — framework-free; hook in
 * ./account-hooks. Delegates to the delete-account Edge Function, which
 * removes the caller's auth user (cascading their personal data and
 * de-attributing their group content). The caller should sign out on
 * success.
 */

/** A group the caller must hand off before they can delete their account. */
export interface SoleAdminGroup {
  id: string;
  name: string;
}

/**
 * Thrown when deletion is refused because the caller is the only admin of
 * one or more groups that still have other members.
 */
export class SoleAdminError extends Error {
  readonly groups: SoleAdminGroup[];
  constructor(groups: SoleAdminGroup[]) {
    super('Cannot delete account while sole admin of a shared group');
    this.name = 'SoleAdminError';
    this.groups = groups;
  }
}

/** Generic deletion failure (auth/network/server). */
export class AccountDeletionError extends Error {
  constructor() {
    super('Account deletion failed');
    this.name = 'AccountDeletionError';
  }
}

/**
 * Delete the caller's account. Resolves on success; throws SoleAdminError
 * (with the blocking groups) or AccountDeletionError otherwise.
 */
export async function deleteAccount(client: HuddleClient): Promise<void> {
  const { data, error } = await client.functions.invoke('delete-account', {
    body: {},
  });

  if (error) {
    const parsed = await readErrorBody(error);
    if (parsed?.error === 'sole_admin') {
      throw new SoleAdminError(parsed.groups ?? []);
    }
    throw new AccountDeletionError();
  }

  // Defensive: some transports surface the structured error in `data`.
  const payload = data as { error?: string; groups?: SoleAdminGroup[] } | null;
  if (payload?.error === 'sole_admin') {
    throw new SoleAdminError(payload.groups ?? []);
  }
  if (payload?.error) throw new AccountDeletionError();
}

/** Pull { error, groups } out of a FunctionsHttpError (context = Response). */
async function readErrorBody(
  error: unknown,
): Promise<{ error?: string; groups?: SoleAdminGroup[] } | null> {
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as { json?: unknown }).json === 'function') {
    try {
      return (await (context as Response).json()) as {
        error?: string;
        groups?: SoleAdminGroup[];
      };
    } catch {
      return null;
    }
  }
  return null;
}

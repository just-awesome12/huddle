import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { mapSupabaseError, isHuddleError } from './errors';

/**
 * Shared internals for the feature data modules (groups, invites, …).
 * Not exported from the package — app code uses the feature modules.
 */

export type HuddleClient = SupabaseClient<Database>;

/** Throw a HuddleError-carrying Error for any Supabase failure. */
export function throwMapped(error: unknown): never {
  if (isHuddleError(error)) throw error;
  const mapped = mapSupabaseError(error);
  const e = Object.assign(new Error(mapped.message), { huddle: mapped });
  throw e;
}

/** Resolve the authenticated user id or throw unauthorized. */
export async function requireUserId(client: HuddleClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throwMapped({ status: 401, message: 'Not authenticated' });
  return user!.id;
}

/**
 * App error taxonomy. Supabase / Postgres / PostgREST throw many shapes
 * of error; the app code shouldn't have to know about all of them. This
 * module normalises them into the four cases the UI actually needs to
 * distinguish.
 */

export type HuddleErrorKind =
  /** RLS denial, missing auth, or wrong role. UI should redirect to sign-in or show a friendly "not allowed" message. */
  | 'unauthorized'
  /** A CHECK / NOT-NULL / type-cast violation. UI should surface a field-level message. */
  | 'validation'
  /** A unique-constraint violation. UI should surface "that value is taken" inline. */
  | 'conflict'
  /** Anything else — network, server, unexpected. UI should show a generic error. */
  | 'unknown';

export interface HuddleError {
  kind: HuddleErrorKind;
  /** Human-readable message. NOT for users; for logs. UI should construct its own copy based on `kind`. */
  message: string;
  /** Underlying error code, where known (e.g. "23505", "PGRST301"). Useful for telemetry. */
  code?: string;
  /** The original error object, in case downstream needs it. */
  cause?: unknown;
}

/**
 * A loose shape that matches both PostgrestError and the raw Postgres
 * error format Supabase Edge Functions throw. We avoid importing
 * concrete types so this module works in any environment.
 */
interface ErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
  statusCode?: number;
  name?: string;
}

const POSTGRES_RLS_VIOLATION = '42501';
const POSTGRES_CHECK_VIOLATION = '23514';
const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_NOT_NULL_VIOLATION = '23502';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Convert any Supabase / Postgres / PostgREST error into a HuddleError.
 *
 * If passed a non-error or null/undefined, returns a generic 'unknown'
 * error rather than throwing. Callers should not have to null-check.
 */
export function mapSupabaseError(input: unknown): HuddleError {
  if (input == null) {
    return { kind: 'unknown', message: 'Unknown error (no payload)' };
  }

  const err = input as ErrorLike;
  const code = typeof err.code === 'string' ? err.code : undefined;
  const message = typeof err.message === 'string' ? err.message : 'Unknown error';
  const status = err.status ?? err.statusCode;

  // ---- Authorization failures ----
  if (code === POSTGRES_RLS_VIOLATION) {
    return { kind: 'unauthorized', message, code, cause: input };
  }
  // PostgREST RLS rejections sometimes surface as 401/403 without a code
  if (status === 401 || status === 403) {
    return { kind: 'unauthorized', message, code, cause: input };
  }

  // ---- Validation failures ----
  if (
    code === POSTGRES_CHECK_VIOLATION ||
    code === POSTGRES_NOT_NULL_VIOLATION ||
    code === POSTGRES_FOREIGN_KEY_VIOLATION
  ) {
    return { kind: 'validation', message, code, cause: input };
  }

  // ---- Conflict ----
  if (code === POSTGRES_UNIQUE_VIOLATION) {
    return { kind: 'conflict', message, code, cause: input };
  }

  // ---- Fallback ----
  return { kind: 'unknown', message, code, cause: input };
}

/**
 * Throw a HuddleError when a Supabase result contains an error. Lets
 * call sites use the simpler `const data = unwrap(await client...())`
 * pattern instead of destructuring `{ data, error }` every time.
 */
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    const mapped = mapSupabaseError(result.error);
    const e = new Error(mapped.message) as Error & { huddle: HuddleError };
    e.huddle = mapped;
    throw e;
  }
  if (result.data == null) {
    const e = new Error('Empty response from Supabase') as Error & {
      huddle: HuddleError;
    };
    e.huddle = { kind: 'unknown', message: 'Empty response' };
    throw e;
  }
  return result.data;
}

/** Type guard for app code: did this error originate from our mapper? */
export function isHuddleError(e: unknown): e is Error & { huddle: HuddleError } {
  return (
    e instanceof Error &&
    'huddle' in e &&
    typeof (e as { huddle: unknown }).huddle === 'object' &&
    (e as { huddle: HuddleError | null }).huddle != null
  );
}

/**
 * Resolve Supabase env vars.
 *
 * Supabase is migrating from `anon` / `service_role` keys to
 * `publishable` / `secret` keys. Both formats work through end of 2026.
 * This helper accepts either, preferring the new format when both are
 * present.
 *
 * Public (anon / publishable) keys are safe to expose to the browser.
 * Service-role / secret keys are NEVER safe in the browser.
 */

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

export interface SupabaseServiceEnv extends SupabaseEnv {
  secretKey: string;
}

function readEnv(key: string): string | undefined {
  // typeof process check keeps this safe in non-Node environments
  // like the browser or Deno (Supabase Edge Functions).
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Resolve URL + public key. Used by browser, server, and native clients.
 *
 * @param env Optional override (useful in tests). Defaults to process.env.
 */
export function resolvePublicEnv(env?: Partial<Record<string, string>>): SupabaseEnv {
  const lookup = (key: string) => env?.[key] ?? readEnv(key);

  const url = lookup('NEXT_PUBLIC_SUPABASE_URL') ?? lookup('EXPO_PUBLIC_SUPABASE_URL');

  const publishableKey =
    lookup('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    lookup('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    lookup('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
    lookup('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error(
      'Supabase URL is not configured. Set NEXT_PUBLIC_SUPABASE_URL (web) or EXPO_PUBLIC_SUPABASE_URL (mobile).',
    );
  }
  if (!publishableKey) {
    throw new Error(
      'Supabase public key is not configured. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy ANON_KEY) for web, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy ANON_KEY) for mobile.',
    );
  }

  return { url, publishableKey };
}

/**
 * Resolve URL + public + secret key. Used ONLY by service-role clients
 * (Edge Functions, trusted server tasks). Never expose to the browser.
 */
export function resolveServiceEnv(env?: Partial<Record<string, string>>): SupabaseServiceEnv {
  const pub = resolvePublicEnv(env);
  const lookup = (key: string) => env?.[key] ?? readEnv(key);

  const secretKey = lookup('SUPABASE_SECRET_KEY') ?? lookup('SUPABASE_SERVICE_ROLE_KEY');

  if (!secretKey) {
    throw new Error(
      'Supabase secret/service-role key is not configured. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY (server-side only).',
    );
  }

  return { ...pub, secretKey };
}

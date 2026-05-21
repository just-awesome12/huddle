import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { resolvePublicEnv } from './env';

/**
 * Singleton browser-side Supabase client.
 *
 * Multiple client instances in the same browser tab cause auth state
 * desynchronization (one has a session, another doesn't). We cache the
 * single instance per module load.
 *
 * This factory is used by:
 *   - Next.js Client Components
 *   - Expo / React Native Web targets
 *
 * For React Native (iOS/Android), use createNativeClient instead —
 * it configures secure storage and disables URL detection.
 */

let cached: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const { url, publishableKey } = resolvePublicEnv();
  cached = createBrowserClient<Database>(url, publishableKey);
  return cached;
}

/**
 * Reset the cached client. Test-only — never call this from app code,
 * it WILL break the auth state of any in-flight requests.
 */
export function __resetBrowserClientForTests(): void {
  cached = null;
}

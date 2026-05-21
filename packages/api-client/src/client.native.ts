import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { resolvePublicEnv } from './env';

/**
 * React Native Supabase client.
 *
 * Differences from the web browser client:
 *
 *   1. Token storage uses expo-secure-store (OS keychain on iOS,
 *      EncryptedSharedPreferences on Android) instead of the default
 *      AsyncStorage. AsyncStorage is plaintext on disk; tokens belong
 *      in secure storage.
 *
 *   2. `detectSessionInUrl` is false. The web client tries to parse
 *      OAuth callback fragments out of window.location, which both
 *      doesn't exist in RN and causes confusion. The mobile OAuth
 *      flow uses expo-auth-session and handles the redirect manually
 *      (Phase 2.6).
 *
 * Singleton, same as the browser client — one auth session per app.
 */

let cached: SupabaseClient<Database> | null = null;

/**
 * The minimal shape we need from expo-secure-store. Declared here so
 * this module doesn't have a hard dependency on the package — the
 * caller injects the implementation. Keeps the package tree-shakeable
 * for web consumers that don't have expo-secure-store installed.
 */
export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Build the storage adapter Supabase Auth expects. Declared as a
 * separate factory so the parameter types are explicit — passing the
 * object inline to `createClient` makes TypeScript fall back to
 * implicit-any on the methods.
 */
interface SupabaseStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function buildStorageAdapter(secureStore: SecureStoreLike): SupabaseStorageAdapter {
  return {
    getItem: (key: string) => secureStore.getItemAsync(key),
    setItem: (key: string, value: string) => secureStore.setItemAsync(key, value),
    removeItem: (key: string) => secureStore.deleteItemAsync(key),
  };
}

export function createNativeSupabaseClient(
  secureStore: SecureStoreLike,
): SupabaseClient<Database> {
  if (cached) return cached;
  const { url, publishableKey } = resolvePublicEnv();
  cached = createClient<Database>(url, publishableKey, {
    auth: {
      storage: buildStorageAdapter(secureStore),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

/** Test-only: reset cache. */
export function __resetNativeClientForTests(): void {
  cached = null;
}

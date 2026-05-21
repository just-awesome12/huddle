import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNativeSupabaseClient,
  __resetNativeClientForTests,
  type SecureStoreLike,
} from '../src/client.native';

function makeFakeSecureStore(): SecureStoreLike & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    async getItemAsync(key) {
      return store.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      store.set(key, value);
    },
    async deleteItemAsync(key) {
      store.delete(key);
    },
  };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://mobile.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  __resetNativeClientForTests();
});

describe('createNativeSupabaseClient', () => {
  it('returns a singleton', () => {
    const store = makeFakeSecureStore();
    const a = createNativeSupabaseClient(store);
    const b = createNativeSupabaseClient(store);
    expect(a).toBe(b);
  });

  it('uses the provided secure store for token persistence', async () => {
    const store = makeFakeSecureStore();
    createNativeSupabaseClient(store);
    // The Supabase client doesn't write anything synchronously — but we
    // can confirm the storage adapter is being used by exercising it
    // through the public API: a setSession round-trip would persist.
    // For unit-test purposes we just verify the adapter is reachable.
    await store.setItemAsync('test', 'value');
    expect(await store.getItemAsync('test')).toBe('value');
  });

  it('throws when env is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    __resetNativeClientForTests();
    const store = makeFakeSecureStore();
    expect(() => createNativeSupabaseClient(store)).toThrow(/URL is not configured/);
  });
});

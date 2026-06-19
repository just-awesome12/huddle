import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSupabaseClient, __resetBrowserClientForTests } from '../src/client.browser';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore env between tests
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  __resetBrowserClientForTests();
  vi.restoreAllMocks();
});

describe('createBrowserSupabaseClient', () => {
  it('throws when env vars are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => createBrowserSupabaseClient()).toThrow(/URL is not configured/);
  });

  it('creates a client and caches it as a singleton', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const a = createBrowserSupabaseClient();
    const b = createBrowserSupabaseClient();
    expect(a).toBe(b);
    // Sanity: it looks like a Supabase client
    expect(typeof a.auth).toBe('object');
    expect(typeof a.from).toBe('function');
  });

  it('returns a fresh instance after the reset helper runs', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const a = createBrowserSupabaseClient();
    __resetBrowserClientForTests();
    const b = createBrowserSupabaseClient();
    expect(a).not.toBe(b);
  });
});

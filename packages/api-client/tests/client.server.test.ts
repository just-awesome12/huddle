import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerSupabaseClient, type CookieAdapter } from '../src/client.server';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

function makeFakeCookieAdapter(): {
  adapter: CookieAdapter;
  reads: number;
  writes: { name: string; value: string }[];
} {
  let reads = 0;
  const writes: { name: string; value: string }[] = [];
  const state: { name: string; value: string }[] = [];

  const adapter: CookieAdapter = {
    getAll() {
      reads++;
      return [...state];
    },
    setAll(cookies) {
      cookies.forEach((c) => {
        writes.push({ name: c.name, value: c.value });
        state.push({ name: c.name, value: c.value });
      });
    },
  };
  return { adapter, reads, writes };
}

describe('createServerSupabaseClient', () => {
  it('returns a working client object', () => {
    const { adapter } = makeFakeCookieAdapter();
    const client = createServerSupabaseClient(adapter);
    expect(typeof client.auth).toBe('object');
    expect(typeof client.from).toBe('function');
  });

  it('does NOT cache (each call returns a fresh client)', () => {
    const { adapter } = makeFakeCookieAdapter();
    const a = createServerSupabaseClient(adapter);
    const b = createServerSupabaseClient(adapter);
    expect(a).not.toBe(b);
  });

  it('throws when env is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { adapter } = makeFakeCookieAdapter();
    expect(() => createServerSupabaseClient(adapter)).toThrow(/URL is not configured/);
  });
});

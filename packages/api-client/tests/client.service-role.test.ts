import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleSupabaseClient } from '../src/client.service-role';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe('createServiceRoleSupabaseClient', () => {
  it('throws when the secret key is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createServiceRoleSupabaseClient()).toThrow(/secret\/service-role/);
  });

  it('accepts SUPABASE_SECRET_KEY as well', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_new';
    expect(() => createServiceRoleSupabaseClient()).not.toThrow();
  });

  it('returns a client object', () => {
    const c = createServiceRoleSupabaseClient();
    expect(typeof c.auth).toBe('object');
    expect(typeof c.from).toBe('function');
  });

  it('returns a fresh client each call (no caching)', () => {
    const a = createServiceRoleSupabaseClient();
    const b = createServiceRoleSupabaseClient();
    expect(a).not.toBe(b);
  });
});

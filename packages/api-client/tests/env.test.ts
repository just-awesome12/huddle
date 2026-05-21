import { describe, expect, it } from 'vitest';
import { resolvePublicEnv, resolveServiceEnv } from '../src/env';

describe('resolvePublicEnv', () => {
  it('prefers the new NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', () => {
    const env = resolvePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy_anon',
    });
    expect(env).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_new',
    });
  });

  it('falls back to legacy NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    const env = resolvePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy_anon',
    });
    expect(env.publishableKey).toBe('legacy_anon');
  });

  it('accepts EXPO_PUBLIC_* variants for mobile', () => {
    const env = resolvePublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://mobile.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'mobile_anon',
    });
    expect(env).toEqual({
      url: 'https://mobile.supabase.co',
      publishableKey: 'mobile_anon',
    });
  });

  it('throws when URL is missing', () => {
    expect(() => resolvePublicEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
    })).toThrow(/URL is not configured/);
  });

  it('throws when public key is missing', () => {
    expect(() => resolvePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    })).toThrow(/public key is not configured/);
  });
});

describe('resolveServiceEnv', () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'pub',
  };

  it('prefers SUPABASE_SECRET_KEY', () => {
    const env = resolveServiceEnv({
      ...base,
      SUPABASE_SECRET_KEY: 'sb_secret_new',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    });
    expect(env.secretKey).toBe('sb_secret_new');
  });

  it('falls back to SUPABASE_SERVICE_ROLE_KEY', () => {
    const env = resolveServiceEnv({
      ...base,
      SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    });
    expect(env.secretKey).toBe('legacy');
  });

  it('throws when secret key is missing', () => {
    expect(() => resolveServiceEnv(base)).toThrow(/secret\/service-role key/);
  });

  it('still throws when public key is missing (inherits public-env check)', () => {
    expect(() => resolveServiceEnv({
      SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    })).toThrow(/URL is not configured/);
  });
});

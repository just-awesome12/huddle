import { describe, expect, it } from 'vitest';
import { mapSupabaseError, unwrap, isHuddleError, type HuddleError } from '../src/errors';

describe('mapSupabaseError', () => {
  it('maps RLS denial (42501) to unauthorized', () => {
    const e = mapSupabaseError({ code: '42501', message: 'new row violates RLS' });
    expect(e.kind).toBe('unauthorized');
    expect(e.code).toBe('42501');
  });

  it('maps HTTP 401 to unauthorized even without code', () => {
    const e = mapSupabaseError({ status: 401, message: 'JWT expired' });
    expect(e.kind).toBe('unauthorized');
  });

  it('maps HTTP 403 to unauthorized', () => {
    const e = mapSupabaseError({ statusCode: 403, message: 'Forbidden' });
    expect(e.kind).toBe('unauthorized');
  });

  it('maps CHECK violation (23514) to validation', () => {
    const e = mapSupabaseError({ code: '23514', message: 'check failed' });
    expect(e.kind).toBe('validation');
  });

  it('maps NOT NULL violation (23502) to validation', () => {
    const e = mapSupabaseError({ code: '23502', message: 'null in non-null col' });
    expect(e.kind).toBe('validation');
  });

  it('maps FK violation (23503) to validation', () => {
    const e = mapSupabaseError({ code: '23503', message: 'fk failed' });
    expect(e.kind).toBe('validation');
  });

  it('maps unique violation (23505) to conflict', () => {
    const e = mapSupabaseError({ code: '23505', message: 'duplicate key' });
    expect(e.kind).toBe('conflict');
  });

  it('maps everything else to unknown', () => {
    const e = mapSupabaseError({ code: 'PGRST999', message: 'mystery' });
    expect(e.kind).toBe('unknown');
    expect(e.code).toBe('PGRST999');
  });

  it('handles null gracefully', () => {
    const e = mapSupabaseError(null);
    expect(e.kind).toBe('unknown');
  });

  it('handles undefined gracefully', () => {
    const e = mapSupabaseError(undefined);
    expect(e.kind).toBe('unknown');
  });

  it('keeps the original error as cause', () => {
    const original = { code: '23505', message: 'duplicate' };
    const e = mapSupabaseError(original);
    expect(e.cause).toBe(original);
  });
});

describe('unwrap', () => {
  it('returns data when there is no error', () => {
    expect(unwrap({ data: { id: 42 }, error: null })).toEqual({ id: 42 });
  });

  it('throws a HuddleError-tagged error when result has error', () => {
    expect(() => unwrap({ data: null, error: { code: '23505', message: 'dup' } })).toThrowError(
      /dup/,
    );
  });

  it('throws with the right kind attached', () => {
    try {
      unwrap({ data: null, error: { code: '42501', message: 'denied' } });
      throw new Error('should have thrown');
    } catch (e) {
      if (!isHuddleError(e)) throw e;
      expect(e.huddle.kind).toBe('unauthorized');
    }
  });

  it('throws when data is null even without an error', () => {
    expect(() => unwrap({ data: null, error: null })).toThrowError(/Empty response/);
  });

  it('preserves zero/false/empty-string data (does not throw)', () => {
    // `null` is the only sentinel; falsy primitives are valid data.
    expect(unwrap({ data: 0, error: null })).toBe(0);
    expect(unwrap({ data: false, error: null })).toBe(false);
    expect(unwrap({ data: '', error: null })).toBe('');
  });
});

describe('isHuddleError', () => {
  it('returns true for errors thrown by unwrap', () => {
    try {
      unwrap({ data: null, error: { code: '23505', message: 'dup' } });
    } catch (e) {
      expect(isHuddleError(e)).toBe(true);
    }
  });

  it('returns false for plain errors', () => {
    expect(isHuddleError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isHuddleError('string')).toBe(false);
    expect(isHuddleError(null)).toBe(false);
    expect(isHuddleError(undefined)).toBe(false);
    expect(isHuddleError({ huddle: 'not an error' })).toBe(false);
  });
});

describe('HuddleError shape', () => {
  it('always includes kind and message', () => {
    const e: HuddleError = mapSupabaseError({ code: '23505', message: 'dup' });
    expect(e.kind).toBeDefined();
    expect(e.message).toBeDefined();
  });
});

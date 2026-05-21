import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from '../src/turnstile';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }) as Response,
  );
}

describe('verifyTurnstileToken', () => {
  it('returns failure immediately when the token is missing', async () => {
    const result = await verifyTurnstileToken('', 'secret');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-response');
  });

  it('returns failure immediately when the secret is missing', async () => {
    const result = await verifyTurnstileToken('token', '');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-secret');
  });

  it('returns success when Cloudflare says success=true', async () => {
    mockFetch({
      success: true,
      'error-codes': [],
      action: 'sign-up',
      challenge_ts: '2026-05-21T12:00:00Z',
      hostname: 'localhost',
    });

    const result = await verifyTurnstileToken('valid-token', 'secret');
    expect(result.success).toBe(true);
    expect(result.errorCodes).toEqual([]);
    expect(result.action).toBe('sign-up');
    expect(result.hostname).toBe('localhost');
  });

  it('returns failure with codes when Cloudflare rejects', async () => {
    mockFetch({
      success: false,
      'error-codes': ['timeout-or-duplicate'],
    });

    const result = await verifyTurnstileToken('expired-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('timeout-or-duplicate');
  });

  it('treats HTTP non-2xx as soft failure', async () => {
    mockFetch({}, 503);
    const result = await verifyTurnstileToken('token', 'secret');
    expect(result.success).toBe(false);
    expect(result.errorCodes[0]).toMatch(/^http-/);
  });

  it('forwards remoteIp when provided', async () => {
    const spy = mockFetch({ success: true });
    await verifyTurnstileToken('token', 'secret', '203.0.113.42');
    const call = spy.mock.calls[0];
    expect(call).toBeDefined();
    const body = call![1]?.body as URLSearchParams;
    expect(body.get('remoteip')).toBe('203.0.113.42');
  });

  it('omits remoteIp when not provided', async () => {
    const spy = mockFetch({ success: true });
    await verifyTurnstileToken('token', 'secret');
    const call = spy.mock.calls[0];
    expect(call).toBeDefined();
    const body = call![1]?.body as URLSearchParams;
    expect(body.get('remoteip')).toBeNull();
  });

  it('sends the right Content-Type', async () => {
    const spy = mockFetch({ success: true });
    await verifyTurnstileToken('token', 'secret');
    const call = spy.mock.calls[0];
    expect(call).toBeDefined();
    const headers = call![1]?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded');
  });
});

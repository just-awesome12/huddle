import { test, expect } from '@playwright/test';

/**
 * Phase 9.1 — security headers + robots. These are applied by
 * next.config headers() to every route, and robots.ts disallows all.
 */

test('responses carry the security headers', async ({ page }) => {
  const response = await page.goto('/sign-in');
  expect(response).not.toBeNull();
  const h = response!.headers();

  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['permissions-policy']).toContain('camera=()');
  // CSP ships report-only first so we observe before enforcing.
  expect(h['content-security-policy-report-only']).toContain("default-src 'self'");
});

test('robots.txt disallows all crawling', async ({ page }) => {
  const res = await page.request.get('/robots.txt');
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('text/plain');
  const body = (await res.text()).toLowerCase();
  expect(body).toContain('disallow: /');
});

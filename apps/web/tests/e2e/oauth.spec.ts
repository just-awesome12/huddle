import { test, expect } from '@playwright/test';

/**
 * Phase 2.4 OAuth machinery tests.
 *
 * Full Google OAuth can't be run in headless CI without burning real
 * test accounts and dealing with Google's bot detection. What we CAN
 * verify is the local plumbing:
 *
 *   - The Google button is present on both auth pages
 *   - Clicking it initiates a redirect (we intercept and verify it
 *     goes to a Google or Supabase OAuth URL)
 *   - The error page renders with reasonable messages
 *   - The Apple button is present but disabled
 */

test.describe('Phase 2.4 — OAuth UI', () => {
  test('Google button is visible on sign-in', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('Google button is visible on sign-up', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('Apple button is visible but disabled', async ({ page }) => {
    await page.goto('/sign-in');
    const apple = page.getByRole('button', { name: /Continue with Apple/i });
    await expect(apple).toBeVisible();
    await expect(apple).toBeDisabled();
  });

  test('clicking Google initiates an OAuth redirect', async ({ page }) => {
    await page.goto('/sign-in');

    // Don't actually follow Google's full flow — just verify that the
    // browser navigates away from /sign-in toward a Supabase or Google
    // OAuth URL when the button is clicked.
    const navigationPromise = page.waitForRequest(
      (req) => {
        const url = req.url();
        return url.includes('/auth/v1/authorize') || url.includes('accounts.google.com');
      },
      { timeout: 5000 },
    );

    await page.getByRole('button', { name: /Continue with Google/i }).click();

    await expect(navigationPromise).resolves.toBeDefined();
  });

  test('error page renders with friendly text for common reasons', async ({ page }) => {
    await page.goto('/auth/error?reason=access_denied');
    await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible();
    await expect(page.getByText(/cancelled/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to sign in/i })).toBeVisible();
  });

  test('error page falls back to raw reason for unknown errors', async ({ page }) => {
    await page.goto('/auth/error?reason=some_weird_error');
    await expect(page.getByText(/some_weird_error/)).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

/**
 * Phase 10 — Terms / Privacy are public (reachable signed-out and by the
 * app stores) and linked from sign-up.
 */

test('terms and privacy are reachable without auth', async ({ page }) => {
  await page.goto('/terms');
  await expect(page).toHaveURL(/\/terms$/); // not bounced to /sign-in
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();

  await page.goto('/privacy');
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
});

test('sign-up links to the legal pages', async ({ page }) => {
  await page.goto('/sign-up');
  await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
});

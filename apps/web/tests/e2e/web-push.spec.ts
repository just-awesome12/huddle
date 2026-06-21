import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 15 — web push (client surface). Verifies the account-page toggle
 * renders and that the service worker is served (not redirected to
 * sign-in by the proxy). Actual subscribe/deliver needs a real push
 * service + granted permission and is verified manually / deferred —
 * selection + payload are covered by unit tests + the send-push probe.
 */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_wpush_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_wpush_${ts}_${r}`.slice(0, 30),
    displayName: 'Push Tester',
  };
}

async function signUp(page: Page, user: ReturnType<typeof makeTestUser>) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>('input[name="turnstileToken"]');
      return !!el && el.value.length > 0;
    },
    null,
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/groups');
}

test('the service worker is served at /sw.js (not auth-walled)', async ({ page }) => {
  const res = await page.request.get('/sw.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/javascript/);
  expect(await res.text()).toContain('notificationclick');
});

test('account page shows the web-push toggle', async ({ page }) => {
  await signUp(page, makeTestUser());
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  // The toggle mounts and resolves to a concrete state (the exact state
  // depends on browser support + whether a VAPID public key is in the
  // build env, which differs between local and CI — so assert it rendered,
  // not a specific state).
  const toggle = page.getByTestId('webpush-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toHaveAttribute('data-state', 'loading');
});

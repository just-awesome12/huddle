import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.5 — Turnstile widget + onboarding flow.
 *
 * Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true in .env.local. That
 * makes the widget populate its hidden token immediately rather than
 * waiting for Cloudflare's challenge. The server-side verifier still
 * runs against Cloudflare's test secret (which accepts any token).
 */

interface TestUser {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

function makeTestUser(): TestUser {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_p25_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p25_${ts}_${r}`.slice(0, 30),
    displayName: 'E2E P25 User',
  };
}

async function waitForTurnstileToken(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>('input[name="turnstileToken"]');
      return !!el && el.value.length > 0;
    },
    null,
    { timeout: 15_000 },
  );
}

async function fillSignUpForm(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await waitForTurnstileToken(page);
}

test('Turnstile widget mounts on sign-up', async ({ page }) => {
  await page.goto('/sign-up');
  await expect(page.getByTestId('turnstile-container')).toBeVisible();
});

test('sign-up with Turnstile + immediate profile finalization', async ({ page }) => {
  const user = makeTestUser();
  await fillSignUpForm(page, user);
  await page.getByRole('button', { name: 'Create account' }).click();
  // We should land in the app (/ forwards to /groups), not /onboarding,
  // because the server action set username/display_name immediately
  // after signup.
  await page.waitForURL('/groups');
  await expect(page.getByRole('heading', { name: 'Your powwows' })).toBeVisible();
});

test('finished users on /onboarding are redirected home', async ({ page }) => {
  const user = makeTestUser();
  await fillSignUpForm(page, user);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/groups');

  // User has finished onboarding. Visiting /onboarding directly should
  // bounce them back into the app (/ forwards to /groups).
  await page.goto('/onboarding');
  await page.waitForURL('/groups');
});

test('signed-out users hitting /onboarding go to /sign-in', async ({ page }) => {
  await page.goto('/onboarding');
  // Proxy enforces auth on /onboarding — no session means redirect.
  await page.waitForURL('/sign-in');
});

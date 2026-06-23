import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.3 happy-path auth E2E.
 *
 * Each test is self-contained: it creates its own user (timestamped
 * email so it's idempotent) and performs its own sign-in if needed.
 *
 * Sign-up assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true is set in
 * .env.local. That makes the Turnstile widget skip Cloudflare's
 * client-side challenge and submit a dummy token immediately, which
 * Cloudflare's test secret accepts.
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
    email: `e2e_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_${ts}_${r}`.slice(0, 30),
    displayName: 'E2E User',
  };
}

async function waitForTurnstileToken(page: Page) {
  // With test mode enabled, the hidden input is populated synchronously
  // on render. Without test mode, the widget needs to load Cloudflare's
  // script and produce a token. Either way: wait for non-empty.
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>('input[name="turnstileToken"]');
      return !!el && el.value.length > 0;
    },
    null,
    { timeout: 15_000 },
  );
}

async function signUp(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await waitForTurnstileToken(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  // Home (/) immediately forwards to /groups (Phase 3).
  await page.waitForURL('/groups');
}

async function signIn(page: Page, user: TestUser) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/groups');
}

test('unauthenticated / shows the public landing (not a redirect)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Stop the');
  // The landing CTAs route into auth.
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/sign-up');
});

test('protected routes still redirect to /sign-in when signed out', async ({ page }) => {
  await page.goto('/groups');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('sign-up creates an account and lands on the app shell', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await expect(page.getByRole('heading', { name: 'Your powwows' })).toBeVisible();
  await expect(page.getByTestId('signed-in-email')).toHaveText(user.email);
});

test('signed-in user is redirected away from /sign-in', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await page.goto('/sign-in');
  await page.waitForURL('/groups');
  await expect(page.getByRole('heading', { name: 'Your powwows' })).toBeVisible();
});

test('sign-out returns to /sign-in', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('sign-in after sign-out lands on the app shell again', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');
  await signIn(page, user);
  await expect(page.getByRole('heading', { name: 'Your powwows' })).toBeVisible();
});

test('sign-in with bad password shows an error', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/incorrect|invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

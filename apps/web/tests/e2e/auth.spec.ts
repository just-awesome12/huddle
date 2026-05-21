import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2.3 happy-path auth E2E.
 *
 * Each test is self-contained: it creates its own user (timestamped
 * email so it's idempotent) and performs its own sign-in if needed.
 * No cross-test state dependency. This is slower than sharing a
 * sign-up across tests, but it's reliable — failures in one test
 * don't cascade.
 *
 * The local Supabase data is wiped by `supabase db reset` if you
 * want to clean up accumulated test users.
 */

interface TestUser {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

function makeTestUser(): TestUser {
  // Date.now() + random suffix avoids collisions across parallel test
  // workers (we run with workers=1 today, but this is robust either way).
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e${ts}${r}`.slice(0, 30),
    displayName: 'E2E User',
  };
}

async function signUp(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/');
}

async function signIn(page: Page, user: TestUser) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}


test('unauthenticated user is redirected from / to /sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('sign-up creates an account and lands on the app shell', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await expect(page.getByText("You're signed in.")).toBeVisible();
  await expect(page.getByTestId('signed-in-email')).toHaveText(user.email);
});

test('signed-in user is redirected away from /sign-in', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  // Now sign-up has landed us on /. Visiting /sign-in should redirect back.
  await page.goto('/sign-in');
  await page.waitForURL('/');
  await expect(page.getByText("You're signed in.")).toBeVisible();
});

test('sign-out returns to /sign-in', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('sign-in after sign-out lands on the app shell again', async ({ page }) => {
  const user = makeTestUser();
  // First sign-up creates the user.
  await signUp(page, user);
  // Sign out so the next step starts clean.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');
  // Sign back in with the same credentials.
  await signIn(page, user);
  await expect(page.getByText("You're signed in.")).toBeVisible();
});

test('sign-in with bad password shows an error', async ({ page }) => {
  const user = makeTestUser();
  // Create the user first so the email exists in the DB.
  await signUp(page, user);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/sign-in');

  // Now attempt sign-in with the wrong password.
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/incorrect|invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

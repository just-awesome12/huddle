import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 14 — user identity (profile editor). Assumes
 * NEXT_PUBLIC_TURNSTILE_TEST_MODE and a live local stack.
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
    email: `e2e_prof_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_prof_${ts}_${r}`.slice(0, 30),
    displayName: 'Profile Tester',
  };
}

async function signUp(page: Page, user: TestUser) {
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

test('edit display name + bio → persists', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();

  await page.getByLabel('Display name').fill('Captain Huddle');
  await page.getByLabel('Bio').fill('Here for the tacos.');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // Persists across a reload.
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Captain Huddle');
  await expect(page.getByLabel('Bio')).toHaveValue('Here for the tacos.');
});

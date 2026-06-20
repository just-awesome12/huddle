import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 13 — RSVP ("I'm in"). Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE and
 * a live local stack.
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
    email: `e2e_rsvp_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_rsvp_${ts}_${r}`.slice(0, 30),
    displayName: 'RSVP Tester',
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

test('RSVP going → shows in the going list → clear', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('RSVP Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('Beach Day');
  await page.getByLabel('Category').selectOption('activity');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  // RSVP section present; nobody's in yet.
  await expect(page.getByTestId('rsvp')).toBeVisible();
  await expect(page.getByTestId('rsvp-going-list')).toBeHidden();

  // I'm in → going list shows me + the count.
  await page.getByTestId('rsvp-going').click();
  await expect(page.getByTestId('rsvp')).toContainText('1 going');
  await expect(page.getByTestId('rsvp-going-list')).toContainText('RSVP Tester');

  // Switch to Maybe → no longer in the going list.
  await page.getByTestId('rsvp-maybe').click();
  await expect(page.getByTestId('rsvp-going-list')).toBeHidden();

  // Clear → my RSVP is gone (Clear control disappears).
  await page.getByTestId('rsvp-clear').click();
  await expect(page.getByTestId('rsvp-clear')).toBeHidden();
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 7.2 — Random picker + decision history (web).
 * Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true and a live local stack
 * with the run_picker Edge Function served.
 */

interface TestUser {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

function makeTestUser(tag: string): TestUser {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_p72_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p72_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P72 ${tag}`,
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

async function signUp(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await waitForTurnstileToken(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/groups');
}

async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  return page.url();
}

async function createIdea(page: Page, groupUrl: string, opts: { title: string; category: string }) {
  await page.goto(groupUrl);
  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill(opts.title);
  await page.getByLabel('Category').selectOption(opts.category);
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
}

test('run picker → result shown → recorded in history', async ({ page }) => {
  await signUp(page, makeTestUser('run'));
  const groupUrl = await createGroup(page, 'Picker Group');
  await createIdea(page, groupUrl, { title: 'Tacos', category: 'food' });
  await createIdea(page, groupUrl, { title: 'Ramen', category: 'food' });

  await page.goto(groupUrl);
  await page.getByTestId('picker-link').click();
  await page.waitForURL(/\/picker$/);
  await expect(page.getByTestId('picker-candidates')).toContainText('Tacos');
  await expect(page.getByTestId('picker-candidates')).toContainText('Ramen');

  await page.getByTestId('picker-run').click();
  await expect(page.getByTestId('picker-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('confetti')).toBeAttached();
  const chosen = (await page.getByTestId('picker-result-title').textContent())?.trim();
  expect(['Tacos', 'Ramen']).toContain(chosen);
  // Provenance: the reveal states it was a random draw and from how many.
  await expect(page.getByTestId('picker-provenance')).toContainText('at random from 2 options');

  // Recorded in history (with the same provenance).
  await page.getByRole('link', { name: /View history/ }).click();
  await page.waitForURL(/\/history$/);
  await expect(page.getByTestId('decision-row')).toHaveCount(1);
  await expect(page.getByTestId('decision-list')).toContainText(chosen!);
  await expect(page.getByTestId('decision-list')).toContainText('randomly from 2 options');

  // Fairness: the proposer of the 2 ideas now shows 1 pick.
  await expect(page.getByTestId('fairness')).toContainText('proposed 2 · picked 1');

  // Recap reflects the activity (2 ideas proposed, 1 picker run).
  await page.getByTestId('recap-link').click();
  await page.waitForURL(/\/recap$/);
  await expect(page.getByTestId('recap-stats')).toContainText('2');
  await expect(page.getByTestId('recap-top-proposer')).toBeVisible();
});

test('a category with fewer than two ideas disables the pick', async ({ page }) => {
  await signUp(page, makeTestUser('flt'));
  const groupUrl = await createGroup(page, 'Filter Picker');
  await createIdea(page, groupUrl, { title: 'Tacos', category: 'food' });
  await createIdea(page, groupUrl, { title: 'Ramen', category: 'food' });
  await createIdea(page, groupUrl, { title: 'Bowling', category: 'activity' });

  await page.goto(`${groupUrl}/picker`);
  // All categories: 3 candidates → enabled.
  await expect(page.getByTestId('picker-run')).toBeEnabled();

  // Activity has only 1 → disabled.
  await page.getByTestId('picker-categories').getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByTestId('picker-run')).toBeDisabled();

  // Food has 2 → enabled again.
  await page.getByTestId('picker-categories').getByRole('button', { name: 'Food' }).click();
  await expect(page.getByTestId('picker-run')).toBeEnabled();
});

test('a chosen idea cannot be hard-deleted — user is told to dismiss', async ({ page }) => {
  await signUp(page, makeTestUser('fk'));
  const groupUrl = await createGroup(page, 'FK Group');
  await createIdea(page, groupUrl, { title: 'Tacos', category: 'food' });
  await createIdea(page, groupUrl, { title: 'Ramen', category: 'food' });

  await page.goto(`${groupUrl}/picker`);
  await page.getByTestId('picker-run').click();
  await expect(page.getByTestId('picker-result')).toBeVisible({ timeout: 10_000 });

  // Open the chosen idea and try to delete it.
  await page.getByRole('link', { name: /View idea/ }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Delete idea' }).click();
  await page.getByRole('button', { name: 'Delete idea' }).click(); // confirm

  await expect(page.getByText(/chosen in a past pick/)).toBeVisible();
  // Still on the idea page (delete refused).
  await expect(page).toHaveURL(/\/ideas\/[0-9a-f-]{36}$/);
});

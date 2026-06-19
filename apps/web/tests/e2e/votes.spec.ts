import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 11 — idea upvotes. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE and a
 * live local stack.
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
    email: `e2e_vote_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_vote_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E VOTE ${tag}`,
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

test('upvote an idea → count increments, persists, and shows on the list', async ({ page }) => {
  await signUp(page, makeTestUser('up'));
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Vote Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('Tacos');
  await page.getByLabel('Category').selectOption('food');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  // Starts at 0, not voted.
  await expect(page.getByTestId('vote-count')).toHaveText('0');
  await expect(page.getByTestId('vote-button')).toHaveAttribute('aria-pressed', 'false');

  // Upvote → 1, pressed.
  await page.getByTestId('vote-button').click();
  await expect(page.getByTestId('vote-count')).toHaveText('1');
  await expect(page.getByTestId('vote-button')).toHaveAttribute('aria-pressed', 'true');

  // Shows on the group list, and an upvoted on-radar idea surfaces in
  // the "Unfinished business" (reignite) section.
  await page.goto(groupUrl);
  await expect(page.getByTestId('idea-vote-count')).toContainText('1');
  await expect(page.getByTestId('reignite')).toContainText('Tacos');

  // Toggle off → back to 0.
  await page.getByTestId('idea-list').getByRole('link').first().click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await page.getByTestId('vote-button').click();
  await expect(page.getByTestId('vote-count')).toHaveText('0');
  await expect(page.getByTestId('vote-button')).toHaveAttribute('aria-pressed', 'false');
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 11 — idea comments. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE and a
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
    email: `e2e_cmt_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_cmt_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E CMT ${tag}`,
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

test('post a comment → appears in the thread + list badge → delete', async ({ page }) => {
  await signUp(page, makeTestUser('c'));
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Chat Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('Ramen night');
  await page.getByLabel('Category').selectOption('food');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  await expect(page.getByText('No comments yet. Start the discussion.')).toBeVisible();

  // Post a comment.
  await page.getByTestId('comment-input').fill("Let's go Friday");
  await page.getByTestId('comment-submit').click();
  await expect(page.getByTestId('comment-list')).toContainText("Let's go Friday");
  await expect(page.getByText('Comments (1)')).toBeVisible();

  // Shows on the group list.
  await page.goto(groupUrl);
  await expect(page.getByTestId('idea-comment-count')).toContainText('1');

  // Back in, delete it.
  await page.getByTestId('idea-list').getByRole('link').first().click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Delete comment' }).click();
  await expect(page.getByText('No comments yet. Start the discussion.')).toBeVisible();
});

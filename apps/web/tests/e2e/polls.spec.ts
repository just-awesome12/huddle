import { test, expect, type Page } from '@playwright/test';

/** Phase 16a — counted majority polls. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_poll_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_poll_${ts}_${r}`.slice(0, 30),
    displayName: 'Poll Maker',
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

test('create a poll, vote, change vote, close, delete', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Poll Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByTestId('polls-link').click();
  await page.waitForURL(/\/polls$/);
  await expect(page.getByText('No polls yet. Ask the group something above.')).toBeVisible();

  // Create a poll.
  await page.getByLabel('Ask the group').fill('Pizza or sushi?');
  await page.getByLabel('Option 1').fill('Pizza');
  await page.getByLabel('Option 2').fill('Sushi');
  await page.getByRole('button', { name: 'Create poll' }).click();

  const poll = page.getByTestId('poll').filter({ hasText: 'Pizza or sushi?' });
  await expect(poll).toBeVisible();
  await expect(poll).toContainText('0 votes');

  // Vote Pizza.
  await poll.getByRole('button', { name: 'Vote Pizza' }).click();
  await expect(poll.getByRole('button', { name: 'Vote Pizza' })).toHaveAttribute(
    'data-voted',
    'true',
  );
  await expect(poll).toContainText('1 vote');

  // Change to Sushi → still one vote, now on Sushi.
  await poll.getByRole('button', { name: 'Vote Sushi' }).click();
  await expect(poll.getByRole('button', { name: 'Vote Sushi' })).toHaveAttribute(
    'data-voted',
    'true',
  );
  await expect(poll.getByRole('button', { name: 'Vote Pizza' })).toHaveAttribute(
    'data-voted',
    'false',
  );
  await expect(poll).toContainText('1 vote');

  // Close → options are disabled.
  await poll.getByRole('button', { name: 'Close' }).click();
  await expect(poll).toContainText('Closed');
  await expect(poll.getByRole('button', { name: 'Vote Sushi' })).toBeDisabled();

  // Delete.
  await poll.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No polls yet. Ask the group something above.')).toBeVisible();
});

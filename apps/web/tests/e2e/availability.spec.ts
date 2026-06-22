import { test, expect, type Page } from '@playwright/test';

/** Phase 16b — availability "when's free?" polls. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_avail_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_avail_${ts}_${r}`.slice(0, 30),
    displayName: 'Avail Maker',
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

test('create an availability poll, mark dates, close, delete', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('When Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByTestId('polls-link').click();
  await page.waitForURL(/\/polls$/);
  await expect(page.getByText('No date polls yet.')).toBeVisible();

  // Create an availability poll with two dates.
  await page.getByLabel('What are we planning?').fill('Dinner next week');
  await page.getByLabel('Date 1').fill('2026-07-01');
  await page.getByRole('button', { name: '+ Add date' }).click();
  await page.getByLabel('Date 2').fill('2026-07-08');
  await page.getByRole('button', { name: /Ask when.s free/ }).click();

  const poll = page.getByTestId('availability-poll').filter({ hasText: 'Dinner next week' });
  await expect(poll).toBeVisible();
  await expect(poll.getByTestId('availability-date')).toHaveCount(2);

  // Mark "yes" on the first date, then change to "maybe".
  const firstDate = poll.getByTestId('availability-date').first();
  await firstDate.getByRole('button', { name: /^yes for/ }).click();
  await expect(
    page
      .getByTestId('availability-poll')
      .filter({ hasText: 'Dinner next week' })
      .getByTestId('availability-date')
      .first()
      .getByRole('button', { name: /^yes for/ }),
  ).toHaveAttribute('data-active', 'true');

  await page
    .getByTestId('availability-poll')
    .filter({ hasText: 'Dinner next week' })
    .getByTestId('availability-date')
    .first()
    .getByRole('button', { name: /^maybe for/ })
    .click();
  await expect(
    page
      .getByTestId('availability-poll')
      .filter({ hasText: 'Dinner next week' })
      .getByTestId('availability-date')
      .first()
      .getByRole('button', { name: /^yes for/ }),
  ).toHaveAttribute('data-active', 'false');

  // Close → the per-date buttons disappear.
  await page
    .getByTestId('availability-poll')
    .filter({ hasText: 'Dinner next week' })
    .getByRole('button', { name: 'Close' })
    .click();
  const closedPoll = page.getByTestId('availability-poll').filter({ hasText: 'Dinner next week' });
  await expect(closedPoll).toContainText('Closed');
  await expect(closedPoll.getByRole('button', { name: /for/ })).toHaveCount(0);

  // Delete.
  await closedPoll.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No date polls yet.')).toBeVisible();
});

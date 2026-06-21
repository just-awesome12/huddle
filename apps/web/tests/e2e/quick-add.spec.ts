import { test, expect, type Page } from '@playwright/test';

/** Phase 15c — inline quick-add (name-only) on the hub. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_qadd_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_qadd_${ts}_${r}`.slice(0, 30),
    displayName: 'Quick Adder',
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

test('quick-add creates an idea from just a title, staying on the hub', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Snack Squad');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  const input = page.getByLabel('Quick-add an idea');
  await input.fill('Tacos al pastor');
  await page.getByRole('button', { name: 'Add' }).click();

  // The idea appears in the list, and we stayed on the hub (not the form).
  await expect(page.getByTestId('idea-list').getByText('Tacos al pastor')).toBeVisible();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);

  // The input clears, ready for the next one.
  await expect(input).toHaveValue('');
});

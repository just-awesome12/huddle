import { test, expect, type Page } from '@playwright/test';

/** Phase 15e — saved/reusable candidate sets in the picker. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_set_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_set_${ts}_${r}`.slice(0, 30),
    displayName: 'Set Saver',
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

async function quickAdd(page: Page, title: string) {
  await page.getByLabel('Quick-add an idea').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('idea-list').getByText(title)).toBeVisible();
}

test('save a shortlist as a set, load it, and delete it', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Set Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await quickAdd(page, 'Pizza');
  await quickAdd(page, 'Sushi');
  await quickAdd(page, 'Tacos');

  await page.getByTestId('picker-link').click();
  await page.waitForURL(/\/picker$/);

  // Build a shortlist of 2 and save it.
  await page.getByTestId('picker-shortlist-toggle').check();
  await page.getByLabel('Include Pizza').check();
  await page.getByLabel('Include Sushi').check();
  await page.getByLabel('Saved set name').fill('Pizza night');
  await page.getByRole('button', { name: 'Save set' }).click();

  // The set appears in the Saved sets section.
  const sets = page.getByTestId('picker-saved-sets');
  await expect(sets.getByRole('button', { name: '▶ Pizza night' })).toBeVisible();

  // Persists across a reload.
  await page.reload();
  await expect(
    page.getByTestId('picker-saved-sets').getByRole('button', { name: '▶ Pizza night' }),
  ).toBeVisible();

  // Loading the set turns on the shortlist and re-selects its ideas.
  await page.getByRole('button', { name: '▶ Pizza night' }).click();
  await expect(page.getByTestId('picker-shortlist-toggle')).toBeChecked();
  await expect(page.getByLabel('Include Pizza')).toBeChecked();
  await expect(page.getByLabel('Include Sushi')).toBeChecked();
  await expect(page.getByLabel('Include Tacos')).not.toBeChecked();

  // Run the picker over the loaded set.
  await page.getByTestId('picker-run').click();
  await expect(page.getByTestId('picker-result')).toBeVisible({ timeout: 10_000 });
  expect(['Pizza', 'Sushi']).toContain(
    (await page.getByTestId('picker-result-title').textContent())?.trim(),
  );

  // Delete the set.
  await page.getByRole('button', { name: 'Delete set Pizza night' }).click();
  await expect(
    page.getByTestId('picker-saved-sets').getByRole('button', { name: '▶ Pizza night' }),
  ).toHaveCount(0);
});

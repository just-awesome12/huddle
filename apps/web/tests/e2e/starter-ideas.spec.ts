import { test, expect, type Page } from '@playwright/test';

/** Phase 15d — one-tap starter ideas from the empty group hub (cold-start fix). */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_starter_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_starter_${ts}_${r}`.slice(0, 30),
    displayName: 'Starter Seeder',
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

test('the empty hub offers one-tap starter ideas', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Cold Start Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  // Fresh group → empty state with the seed CTA.
  await expect(page.getByText('No ideas yet')).toBeVisible();
  await page.getByRole('button', { name: /Add starter ideas/ }).click();

  // The hub fills with the starter ideas.
  const list = page.getByTestId('idea-list');
  await expect(list.getByText('Movie night')).toBeVisible();
  await expect(list.getByText('Game night')).toBeVisible();
  await expect(page.getByText('No ideas yet')).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 13 — emoji reactions. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE and
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
    email: `e2e_react_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_react_${ts}_${r}`.slice(0, 30),
    displayName: 'React Tester',
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

test('react to an idea → count + pressed toggles', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('React Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('Karaoke');
  await page.getByLabel('Category').selectOption('activity');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  const fire = page.getByTestId('reaction-bar').first().getByTestId('react-🔥');
  await expect(fire).toHaveAttribute('aria-pressed', 'false');

  // React → pressed + count 1.
  await fire.click();
  const fireAfter = page.getByTestId('reaction-bar').first().getByTestId('react-🔥');
  await expect(fireAfter).toHaveAttribute('aria-pressed', 'true');
  await expect(fireAfter).toContainText('1');

  // Un-react → back to unpressed.
  await fireAfter.click();
  await expect(page.getByTestId('reaction-bar').first().getByTestId('react-🔥')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

import { test, expect, type Page } from '@playwright/test';

/** Phase 15c — relative-date quick-fill chips on the idea form. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_dchip_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_dchip_${ts}_${r}`.slice(0, 30),
    displayName: 'Date Chipper',
  };
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
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

test('a date chip fills the idea date field', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Date Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: '+ New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);

  const dateField = page.getByLabel('Date (optional)');
  await expect(dateField).toHaveValue('');

  // "Tomorrow" fills the field with tomorrow's local date.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await expect(dateField).toHaveValue(ymd(tomorrow));

  // "Clear" empties it again.
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(dateField).toHaveValue('');
});

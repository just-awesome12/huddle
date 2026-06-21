import { test, expect, type Page } from '@playwright/test';

/** Phase 14 — group identity (admin picks emoji + accent color). */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_gid_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_gid_${ts}_${r}`.slice(0, 30),
    displayName: 'Identity Admin',
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

test('admin can set the group emoji + accent color', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Taco Tuesday');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();
  const groupId = groupUrl.split('/').pop()!;

  await page.goto(`/groups/${groupId}/settings`);
  await page.getByRole('radio', { name: 'Emoji 🎲' }).click();
  await page.getByRole('radio', { name: 'Color #2f9e8f' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // Persists across a reload of settings.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Emoji 🎲' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // And the chosen emoji shows on the hub banner.
  await page.goto(`/groups/${groupId}`);
  await expect(page.getByText('🎲').first()).toBeVisible();
});

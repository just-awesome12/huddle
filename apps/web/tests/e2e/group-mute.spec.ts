import { test, expect, type Page } from '@playwright/test';

/** Phase 15b — per-group notification mute toggle on the hub. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_mute_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_mute_${ts}_${r}`.slice(0, 30),
    displayName: 'Mute Tester',
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

test('a member can mute and unmute a group; the choice persists', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Noisy Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  const toggle = page.getByTestId('group-mute-toggle');
  await expect(toggle).toHaveAttribute('data-muted', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-muted', 'true');

  // Persists across a reload (server-fetched).
  await page.reload();
  await expect(page.getByTestId('group-mute-toggle')).toHaveAttribute('data-muted', 'true');

  // And unmute round-trips.
  await page.getByTestId('group-mute-toggle').click();
  await expect(page.getByTestId('group-mute-toggle')).toHaveAttribute('data-muted', 'false');
});

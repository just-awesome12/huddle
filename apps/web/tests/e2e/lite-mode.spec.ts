import { test, expect, type Page } from '@playwright/test';

/** Phase 16d — admin-toggled lite mode trims the hub for small groups. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_lite_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_lite_${ts}_${r}`.slice(0, 30),
    displayName: 'Lite Tester',
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

test('an admin can enable lite mode; the hub drops polls/feed/presence', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Roommates');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();

  // Full hub by default: polls link, presence, and the activity feed
  // (the creator's "joined" event) are all present.
  await expect(page.getByTestId('polls-link')).toBeVisible();
  await expect(page.getByTestId('presence')).toBeVisible();
  await expect(page.getByTestId('activity-feed')).toBeVisible();

  // Enable lite mode in settings.
  await page.goto(`${groupUrl}/settings`);
  const toggle = page.getByTestId('lite-mode-toggle');
  await expect(toggle).toHaveAttribute('data-lite', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-lite', 'true');
  // data-lite is optimistic; the button stays disabled until the server
  // action + revalidate finish, so wait for it to re-enable before reading
  // the hub (else we'd navigate before the write commits).
  await expect(toggle).toBeEnabled();

  // Back on the hub: the crowd surface is gone, the core stays.
  await page.goto(groupUrl);
  await expect(page.getByTestId('polls-link')).toHaveCount(0);
  await expect(page.getByTestId('presence')).toHaveCount(0);
  await expect(page.getByTestId('activity-feed')).toHaveCount(0);
  // Core decision tools remain.
  await expect(page.getByTestId('picker-link')).toBeVisible();
  await expect(page.getByTestId('wall-link')).toBeVisible();
  await expect(page.getByTestId('history-link')).toBeVisible();

  // Turning it back off restores the full hub.
  await page.goto(`${groupUrl}/settings`);
  const toggleOff = page.getByTestId('lite-mode-toggle');
  await toggleOff.click();
  await expect(toggleOff).toHaveAttribute('data-lite', 'false');
  await expect(toggleOff).toBeEnabled();
  await page.goto(groupUrl);
  await expect(page.getByTestId('polls-link')).toBeVisible();
});

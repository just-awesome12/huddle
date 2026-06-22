import { test, expect, type Page } from '@playwright/test';

/** Phase 15e — bulk invite (paste many emails at once). */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_bulk_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_bulk_${ts}_${r}`.slice(0, 30),
    displayName: 'Bulk Inviter',
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

test('bulk invite sends many at once and reports invalid tokens', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Bulk Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/([0-9a-f-]{36})$/);
  const groupId = page.url().match(/groups\/([0-9a-f-]{36})/)![1];

  await page.goto(`/groups/${groupId}/invite`);

  await page
    .getByLabel('Invite several people')
    .fill('first@huddle.test, second@huddle.test\nnot-an-email');
  await page.getByRole('button', { name: 'Send invites' }).click();

  const result = page.getByTestId('bulk-invite-result');
  await expect(result).toContainText('Sent 2 invites');
  await expect(result).toContainText('not-an-email');

  // Both emails now appear as open invites.
  const list = page.getByTestId('invite-list');
  await expect(list.getByText('first@huddle.test')).toBeVisible();
  await expect(list.getByText('second@huddle.test')).toBeVisible();
});

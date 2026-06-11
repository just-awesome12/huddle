import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 3.2 — Groups & Membership web UI.
 *
 * Each test creates its own user (timestamped email, idempotent) and
 * exercises the group CRUD flows. Multi-member scenarios (remove
 * member, role interplay) need the invite flow from Phase 4 — those
 * paths are covered by pgTAP RLS tests until then.
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
    email: `e2e_p32_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p32_${ts}_${r}`.slice(0, 30),
    displayName: 'E2E P32 User',
  };
}

async function waitForTurnstileToken(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>(
        'input[name="turnstileToken"]',
      );
      return !!el && el.value.length > 0;
    },
    null,
    { timeout: 15_000 },
  );
}

async function signUp(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await waitForTurnstileToken(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/groups');
}

async function createGroup(page: Page, name: string) {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
}

test('new user sees the empty state', async ({ page }) => {
  await signUp(page, makeTestUser());
  await expect(page.getByText('No groups yet')).toBeVisible();
});

test('create group → detail page → appears in list with admin badge', async ({ page }) => {
  const user = makeTestUser();
  await signUp(page, user);

  await createGroup(page, 'Friday Dinner Club');

  // Detail page: name, me as the only member, with role badge.
  await expect(page.getByTestId('group-name')).toHaveText('Friday Dinner Club');
  await expect(page.getByText('Members (1)')).toBeVisible();
  await expect(page.getByText(user.displayName)).toBeVisible();
  await expect(page.getByText('(you)')).toBeVisible();
  await expect(page.getByTestId('role-badge-admin')).toBeVisible();

  // List page shows the group with my role.
  await page.goto('/groups');
  await expect(page.getByTestId('group-list')).toContainText('Friday Dinner Club');
  await expect(page.getByTestId('role-badge-admin')).toBeVisible();
});

test('whitespace-only group name is rejected with a field error', async ({ page }) => {
  await signUp(page, makeTestUser());
  await page.goto('/groups/new');
  // "   " passes the browser's required check but fails Zod's trim+min(1).
  await page.getByLabel('Group name').fill('   ');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByText('Group name is required')).toBeVisible();
  await expect(page).toHaveURL(/\/groups\/new$/);
});

test('admin can rename the group from settings', async ({ page }) => {
  await signUp(page, makeTestUser());
  await createGroup(page, 'Old Name');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.waitForURL(/\/settings$/);

  await page.getByLabel('Group name').fill('New Name');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Group renamed.')).toBeVisible();

  // Detail + list reflect the rename.
  await page.goto('/groups');
  await expect(page.getByTestId('group-list')).toContainText('New Name');
  await expect(page.getByTestId('group-list')).not.toContainText('Old Name');
});

test('sole admin cannot leave; sees friendly error', async ({ page }) => {
  await signUp(page, makeTestUser());
  await createGroup(page, 'Lonely Group');

  await page.getByRole('button', { name: 'Leave group' }).click();
  // Inline confirmation step.
  await page.getByRole('button', { name: 'Leave group' }).click();

  await expect(
    page.getByText(/only admin.*promote another member/i),
  ).toBeVisible();
  // Still on the group page — leave was blocked by the DB trigger.
  await expect(page.getByTestId('group-name')).toHaveText('Lonely Group');
});

test('admin can delete the group with confirmation', async ({ page }) => {
  await signUp(page, makeTestUser());
  await createGroup(page, 'Doomed Group');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.waitForURL(/\/settings$/);

  await page.getByRole('button', { name: 'Delete group' }).click();
  // Inline confirmation step.
  await expect(page.getByText(/cannot be undone/i)).toBeVisible();
  await page.getByRole('button', { name: 'Delete group' }).click();

  await page.waitForURL('/groups');
  await expect(page.getByText('No groups yet')).toBeVisible();
});

test('cancel button backs out of a destructive confirmation', async ({ page }) => {
  await signUp(page, makeTestUser());
  await createGroup(page, 'Sticky Group');

  await page.getByRole('button', { name: 'Leave group' }).click();
  await expect(page.getByText(/leave this group\?/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Back to the initial button; no navigation happened.
  await expect(page.getByRole('button', { name: 'Leave group' })).toBeVisible();
  await expect(page.getByTestId('group-name')).toHaveText('Sticky Group');
});

test('visiting a nonexistent group 404s instead of leaking', async ({ page }) => {
  await signUp(page, makeTestUser());
  await page.goto('/groups/00000000-0000-0000-0000-000000000000');
  await expect(page.getByText(/404|not found/i).first()).toBeVisible();
});

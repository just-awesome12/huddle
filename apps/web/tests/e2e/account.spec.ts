import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 10 — account deletion (web). Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE
 * and a live local stack serving the delete-account Edge Function.
 */

interface TestUser {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

function makeTestUser(tag: string): TestUser {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_p10_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p10_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P10 ${tag}`,
  };
}

async function waitForTurnstileToken(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>('input[name="turnstileToken"]');
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

test('a user with no groups can delete their account', async ({ page }) => {
  await signUp(page, makeTestUser('del'));

  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Delete account' }).click(); // confirm

  await page.waitForURL(/\/sign-in/);
  await expect(page).toHaveURL(/deleted=1/);
});

test('sole admin of a shared group is blocked with a clear message', async ({ page, browser }) => {
  const admin = makeTestUser('adm');
  await signUp(page, admin);
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Shared Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  // Invite a second member by link.
  await page.getByRole('link', { name: 'Invite' }).click();
  await page.getByRole('button', { name: 'Generate invite link' }).click();
  const inviteUrl = (await page.getByTestId('invite-url').textContent())!;

  const context = await browser.newContext();
  const member = await context.newPage();
  try {
    await signUp(member, makeTestUser('mbr'));
    await member.goto(inviteUrl);
    await member.getByRole('button', { name: 'Accept invite' }).click();
    await member.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

    // Admin tries to delete — refused while sole admin of a shared group.
    await page.goto('/account');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('button', { name: 'Delete account' }).click();

    await expect(page.getByText(/only admin of/i)).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
  } finally {
    await context.close();
  }
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 10 — content moderation (report + block/unblock).
 * Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE and a live local stack.
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
    email: `e2e_mod_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_mod_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E MOD ${tag}`,
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

test('member can report an idea, block the author (hides their ideas), then unblock', async ({
  page,
  browser,
}) => {
  const admin = makeTestUser('adm');
  await signUp(page, admin);
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Mod Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();

  // Admin posts an idea.
  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('Admin idea');
  await page.getByLabel('Category').selectOption('food');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  // Invite a member.
  await page.goto(groupUrl);
  await page.getByRole('link', { name: 'Invite', exact: true }).click();
  await page.getByRole('button', { name: 'Generate invite link' }).click();
  const inviteUrl = (await page.getByTestId('invite-url').textContent())!;

  const context = await browser.newContext();
  const member = await context.newPage();
  try {
    await signUp(member, makeTestUser('mbr'));
    await member.goto(inviteUrl);
    await member.getByRole('button', { name: 'Accept invite' }).click();
    await member.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

    // Open the admin's idea.
    await member.getByTestId('idea-list').getByRole('link').first().click();
    await member.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

    // Report it.
    await member.getByTestId('report-open').click();
    await member.getByLabel('Why are you reporting this?').selectOption('inappropriate');
    await member.getByRole('button', { name: 'Submit report' }).click();
    await expect(member.getByTestId('report-done')).toBeVisible();

    // Block the author → redirected to the group, idea now hidden.
    await member.getByRole('button', { name: /^Block @/ }).click();
    await member.getByRole('button', { name: 'Block', exact: true }).click();
    await member.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    await expect(member.getByText('No ideas yet')).toBeVisible();

    // Unblock from Account → idea visible again.
    await member.goto('/account');
    await expect(member.getByTestId('blocked-list')).toContainText(admin.displayName);
    await member.getByRole('button', { name: 'Unblock' }).click();
    await member.getByRole('button', { name: 'Unblock' }).click(); // confirm
    await member.goto(groupUrl);
    await expect(member.getByTestId('idea-list')).toContainText('Admin idea');
  } finally {
    await context.close();
  }
});

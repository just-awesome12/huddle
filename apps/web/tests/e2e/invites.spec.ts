import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * Phase 4.2 — Invites E2E, including the multi-member flows deferred
 * from Phase 3 (which needed a second member in a group).
 *
 * Tests use two (sometimes three) isolated browser contexts to act as
 * different users. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true.
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
    email: `e2e_p42_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p42_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P42 ${tag}`,
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

async function fillSignUpFormAndSubmit(page: Page, user: TestUser) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await waitForTurnstileToken(page);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function signUp(page: Page, user: TestUser) {
  await page.goto('/sign-up');
  await fillSignUpFormAndSubmit(page, user);
  await page.waitForURL('/groups');
}

async function createGroup(page: Page, name: string) {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
}

async function generateInviteLink(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'Invite', exact: true }).click();
  await page.waitForURL(/\/invite$/);
  await page.getByRole('button', { name: 'Generate invite link' }).click();
  const url = await page.getByTestId('invite-url').textContent();
  expect(url).toMatch(/\/invites\/[A-Za-z0-9_-]{40,64}$/);
  return url!;
}

async function inNewContext<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

test('invite → accept → both see members → admin removes → access revoked', async ({
  page,
  browser,
}) => {
  const admin = makeTestUser('adm');
  const joiner = makeTestUser('jnr');

  // Admin: sign up, create group, generate invite.
  await signUp(page, admin);
  await createGroup(page, 'Invite Flow Group');
  const groupUrl = page.url().replace(/\/invite$/, '');
  const inviteUrl = await generateInviteLink(page);

  // The invite appears in the open-invites list.
  await expect(page.getByTestId('invite-list')).toContainText('Open link');

  // Joiner (separate browser context): sign up, open link, accept.
  await inNewContext(browser, async (joinerPage) => {
    await signUp(joinerPage, joiner);
    await joinerPage.goto(inviteUrl);
    await expect(joinerPage.getByTestId('invite-group-name')).toHaveText('Invite Flow Group');
    await expect(joinerPage.getByText(`Invited by ${admin.displayName}`)).toBeVisible();
    await joinerPage.getByRole('button', { name: 'Accept invite' }).click();
    await joinerPage.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

    // Joiner sees both members; own role badge is Member.
    await expect(joinerPage.getByText('Members (2)')).toBeVisible();
    await expect(joinerPage.getByTestId('member-list').getByText(admin.displayName)).toBeVisible();
    await expect(joinerPage.getByTestId('role-badge-member')).toBeVisible();

    // Admin: sees the new member, removes them.
    await page.goto(groupUrl);
    await expect(page.getByText('Members (2)')).toBeVisible();
    await expect(page.getByTestId('member-list').getByText(joiner.displayName)).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Remove member' }).click();
    await expect(page.getByText('Members (1)')).toBeVisible();
    await expect(page.getByTestId('member-list').getByText(joiner.displayName)).not.toBeVisible();

    // Joiner: access is gone — group page now 404s.
    await joinerPage.reload();
    await expect(joinerPage.getByText(/404|not found/i).first()).toBeVisible();
  });
});

test('used invite cannot be accepted again', async ({ page, browser }) => {
  const admin = makeTestUser('adm2');

  await signUp(page, admin);
  await createGroup(page, 'Single Use Group');
  const inviteUrl = await generateInviteLink(page);

  // First joiner uses the invite.
  await inNewContext(browser, async (p) => {
    await signUp(p, makeTestUser('jnr2'));
    await p.goto(inviteUrl);
    await p.getByRole('button', { name: 'Accept invite' }).click();
    await p.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  });

  // Second joiner gets the already-used status.
  await inNewContext(browser, async (p) => {
    await signUp(p, makeTestUser('jnr3'));
    await p.goto(inviteUrl);
    await expect(p.getByTestId('invite-status')).toHaveText('Invite already used');
  });
});

test('revoked invite stops working', async ({ page, browser }) => {
  const admin = makeTestUser('adm3');

  await signUp(page, admin);
  await createGroup(page, 'Revoke Group');
  const inviteUrl = await generateInviteLink(page);

  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke invite' }).click();
  await expect(page.getByText('No open invites')).toBeVisible();

  await inNewContext(browser, async (p) => {
    await signUp(p, makeTestUser('jnr4'));
    await p.goto(inviteUrl);
    await expect(p.getByTestId('invite-status')).toHaveText('Invite not found');
  });
});

test('signed-out invite link survives the auth round-trip (?next=)', async ({ page, browser }) => {
  const admin = makeTestUser('adm4');

  await signUp(page, admin);
  await createGroup(page, 'Deep Link Group');
  const inviteUrl = await generateInviteLink(page);

  await inNewContext(browser, async (p) => {
    // Signed out: deep link bounces to sign-in carrying ?next=.
    await p.goto(inviteUrl);
    await p.waitForURL(/\/sign-in\?next=%2Finvites%2F/);

    // New user follows the "Create one" switch link (next is carried along).
    await p.getByRole('link', { name: 'Create one' }).click();
    await p.waitForURL(/\/sign-up\?next=%2Finvites%2F/);
    await fillSignUpFormAndSubmit(p, makeTestUser('jnr5'));

    // After sign-up we land back on the invite, not the home page.
    await p.waitForURL(/\/invites\/[A-Za-z0-9_-]{40,64}$/);
    await expect(p.getByTestId('invite-group-name')).toHaveText('Deep Link Group');
    await p.getByRole('button', { name: 'Accept invite' }).click();
    await p.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    await expect(p.getByText('Members (2)')).toBeVisible();
  });
});

test('member (non-sole-admin) can leave a group', async ({ page, browser }) => {
  const admin = makeTestUser('adm5');

  await signUp(page, admin);
  await createGroup(page, 'Leavable Group');
  const inviteUrl = await generateInviteLink(page);

  await inNewContext(browser, async (p) => {
    await signUp(p, makeTestUser('jnr6'));
    await p.goto(inviteUrl);
    await p.getByRole('button', { name: 'Accept invite' }).click();
    await p.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

    // Leave (two-step confirm) — succeeds because another admin remains.
    await p.getByRole('button', { name: 'Leave group' }).click();
    await p.getByRole('button', { name: 'Leave group' }).click();
    await p.waitForURL('/groups');
    await expect(p.getByText('No groups yet')).toBeVisible();
  });
});

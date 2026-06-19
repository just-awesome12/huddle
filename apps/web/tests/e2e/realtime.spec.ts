import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 6.2 — web realtime. Two browser contexts (A = admin, B = a
 * second member) on the SAME group; a change by A appears for B without
 * a reload. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true and a live
 * local Supabase (realtime reachable).
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
    email: `e2e_p62_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p62_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P62 ${tag}`,
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

async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  return page.url();
}

async function inviteSecondMember(adminPage: Page): Promise<string> {
  await adminPage.getByRole('link', { name: 'Invite' }).click();
  await adminPage.waitForURL(/\/invite$/);
  await adminPage.getByRole('button', { name: 'Generate invite link' }).click();
  const url = await adminPage.getByTestId('invite-url').textContent();
  return url!;
}

async function acceptInvite(page: Page, inviteUrl: string): Promise<string> {
  await page.goto(inviteUrl);
  await page.getByRole('button', { name: 'Accept invite' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  return page.url();
}

test('connection indicator reaches Live', async ({ page }) => {
  await signUp(page, makeTestUser('dot'));
  // The provider mounts in the app shell; the dot should go SUBSCRIBED.
  await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'SUBSCRIBED', {
    timeout: 15_000,
  });
});

test('A adds an idea → B sees it live without reloading', async ({ browser }) => {
  const admin = makeTestUser('a');
  const member = makeTestUser('b');

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await signUp(a, admin);
    const groupUrl = await createGroup(a, 'Realtime Group');
    const inviteUrl = await inviteSecondMember(a);

    await signUp(b, member);
    const bGroupUrl = await acceptInvite(b, inviteUrl);
    expect(bGroupUrl).toBe(groupUrl);

    // B is parked on the group page. Wait for B's group channel to be
    // live before A mutates, so we don't race the subscription.
    await expect(b.getByTestId('realtime-status')).toHaveAttribute('data-status', 'SUBSCRIBED', {
      timeout: 15_000,
    });
    await expect(b.getByText('No ideas yet')).toBeVisible();

    // A adds an idea from its own context.
    await a.goto(groupUrl);
    await a.getByRole('link', { name: 'New idea' }).click();
    await a.getByLabel('Title').fill('Live Idea');
    await a.getByLabel('Category').selectOption('food');
    await a.getByRole('button', { name: 'Add idea' }).click();
    await a.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

    // B's page should update on its own — no reload.
    await expect(b.getByTestId('idea-list')).toContainText('Live Idea', {
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('removed member loses access live (membership event → refresh → 404)', async ({ browser }) => {
  const admin = makeTestUser('ra');
  const member = makeTestUser('rb');

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await signUp(a, admin);
    const groupUrl = await createGroup(a, 'Eviction Group');
    const inviteUrl = await inviteSecondMember(a);

    await signUp(b, member);
    await acceptInvite(b, inviteUrl);
    await expect(b.getByTestId('realtime-status')).toHaveAttribute('data-status', 'SUBSCRIBED', {
      timeout: 15_000,
    });

    // A removes B.
    await a.goto(groupUrl);
    await a.getByRole('button', { name: 'Remove', exact: true }).click();
    await a.getByRole('button', { name: 'Remove member' }).click();
    await expect(a.getByText('Members (1)')).toBeVisible();

    // B's membership-delete event triggers a refresh; the group is now
    // RLS-invisible to B → not found.
    await expect(b.getByText(/404|not found/i).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * Phase 4.4 — add-by-username flow + search rate limiting.
 * Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true.
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
    email: `e2e_p44_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p44_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P44 ${tag}`,
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

async function signIn(page: Page, user: TestUser) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/groups');
}

async function createGroup(page: Page, name: string) {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
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

test('add by username → invitee sees pending invite → accepts', async ({ page, browser }) => {
  const admin = makeTestUser('adm');
  const invitee = makeTestUser('inv');

  // Invitee signs up first so they're searchable.
  await inNewContext(browser, async (p) => {
    await signUp(p, invitee);
  });

  // Admin: group → invite page → search → invite.
  await signUp(page, admin);
  await createGroup(page, 'Username Invite Group');
  await page.getByRole('link', { name: 'Invite' }).click();
  await page.waitForURL(/\/invite$/);

  // Search the FULL username: the DB persists across runs, so a short
  // prefix matches stale users from earlier suites.
  await page.getByLabel('Add by username').fill(invitee.username);
  const results = page.getByTestId('username-results');
  await expect(results).toContainText(`@${invitee.username}`);
  await results
    .locator('li')
    .filter({ hasText: `@${invitee.username}` })
    .getByRole('button', { name: 'Invite' })
    .click();
  await expect(page.getByText('Invited ✓')).toBeVisible();

  // The addressed invite shows in the open-invites list.
  await page.reload();
  await expect(page.getByTestId('invite-list')).toContainText(`For @${invitee.username}`);

  // Invitee: pending invite on /groups → view → accept.
  await inNewContext(browser, async (p) => {
    await signIn(p, invitee);
    const pending = p.getByTestId('pending-invites');
    await expect(pending).toContainText('Username Invite Group');
    await expect(pending).toContainText(`Invited by ${admin.displayName}`);
    await pending.getByRole('link').click();
    await p.waitForURL(/\/invites\/[A-Za-z0-9_-]{40,64}$/);
    await p.getByRole('button', { name: 'Accept invite' }).click();
    await p.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    await expect(p.getByText('Members (2)')).toBeVisible();
  });
});

test('search returns empty for nonexistent username prefixes', async ({ page }) => {
  await signUp(page, makeTestUser('emp'));
  await createGroup(page, 'Empty Search Group');
  await page.getByRole('link', { name: 'Invite' }).click();
  await page.waitForURL(/\/invite$/);

  await page.getByLabel('Add by username').fill('zz_no_such_user_zz');
  await expect(page.getByText('No matching usernames.')).toBeVisible();
});

test('search is rate-limited after 10 requests in a minute', async ({ page }) => {
  await signUp(page, makeTestUser('rl'));

  const statuses = await page.evaluate(async () => {
    const out: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`/api/profiles/search?q=ratelimitprobe`);
      out.push(res.status);
    }
    return out;
  });

  expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
  expect(statuses[10]).toBe(429);
});

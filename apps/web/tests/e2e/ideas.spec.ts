import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5.2 — Ideas web UI.
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
    email: `e2e_p52_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p52_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P52 ${tag}`,
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

async function createIdea(
  page: Page,
  opts: {
    title: string;
    category?: string;
    description?: string;
    link?: string;
    eventDate?: string;
    location?: string;
  },
) {
  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill(opts.title);
  if (opts.category) await page.getByLabel('Category').selectOption(opts.category);
  if (opts.description) await page.getByLabel(/Description/).fill(opts.description);
  if (opts.link) await page.getByLabel(/Link/).fill(opts.link);
  if (opts.eventDate) await page.getByLabel(/Date/).fill(opts.eventDate);
  if (opts.location) await page.getByLabel(/Location/).fill(opts.location);
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
}

test('create idea → detail → appears in group list with badges', async ({ page }) => {
  await signUp(page, makeTestUser('crt'));
  const groupUrl = await createGroup(page, 'Idea Group');

  await expect(page.getByText('No ideas yet')).toBeVisible();

  await createIdea(page, {
    title: 'Taco Tuesday',
    category: 'food',
    description: 'That new place on 5th',
    link: 'https://example.com/tacos',
    eventDate: '2026-07-04',
    location: 'Riverside Park',
  });

  // Detail page shows everything.
  await expect(page.getByTestId('idea-title')).toHaveText('Taco Tuesday');
  await expect(page.getByText('That new place on 5th')).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://example.com/tacos' })).toBeVisible();
  await expect(page.getByTestId('category-badge-food')).toBeVisible();
  await expect(page.getByTestId('status-badge-on_radar')).toBeVisible();
  await expect(page.getByTestId('idea-location')).toContainText('Riverside Park');
  await expect(page.getByTestId('idea-date')).toBeVisible();

  // Group list shows the idea (with its location on the row).
  await page.goto(groupUrl);
  await expect(page.getByTestId('idea-list')).toContainText('Taco Tuesday');
  await expect(page.getByTestId('idea-list')).toContainText('Riverside Park');
  await expect(page.getByText('Ideas (1)')).toBeVisible();
});

test('whitespace title and javascript: link are rejected', async ({ page }) => {
  await signUp(page, makeTestUser('val'));
  await createGroup(page, 'Validation Group');

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill('   ');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await expect(page.getByText('Title is required')).toBeVisible();

  await page.getByLabel('Title').fill('Legit title');
  await page.getByLabel(/Link/).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await expect(page.getByText(/valid http/)).toBeVisible();
  await expect(page).toHaveURL(/\/ideas\/new$/);
});

test('status flow: done → back on the radar', async ({ page }) => {
  await signUp(page, makeTestUser('sts'));
  await createGroup(page, 'Status Group');
  await createIdea(page, { title: 'Museum trip', category: 'activity' });

  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByTestId('status-badge-done')).toBeVisible();

  await page.getByRole('button', { name: 'Back on the radar' }).click();
  await expect(page.getByTestId('status-badge-on_radar')).toBeVisible();
});

test('filters by status and category', async ({ page }) => {
  await signUp(page, makeTestUser('flt'));
  const groupUrl = await createGroup(page, 'Filter Group');

  await createIdea(page, { title: 'Pizza place', category: 'food' });
  await page.goto(groupUrl);
  await createIdea(page, { title: 'Climbing gym', category: 'activity' });

  // Mark the second one done.
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByTestId('status-badge-done')).toBeVisible();

  await page.goto(groupUrl);
  await expect(page.getByTestId('idea-list')).toContainText('Pizza place');
  await expect(page.getByTestId('idea-list')).toContainText('Climbing gym');

  // Category filter. Wait for each navigation to settle before the
  // next chip click — chips are server-rendered links whose hrefs
  // depend on the CURRENT filters.
  await page.getByTestId('idea-filters').getByRole('link', { name: 'Food' }).click();
  await page.waitForURL(/category=food/);
  await expect(page.getByTestId('idea-list')).toContainText('Pizza place');
  await expect(page.getByTestId('idea-list')).not.toContainText('Climbing gym');

  // Status filter (combined with clearing category).
  await page.getByTestId('idea-filters').getByRole('link', { name: 'Any category' }).click();
  await page.waitForURL((url) => !url.search.includes('category'));
  await page.getByTestId('idea-filters').getByRole('link', { name: 'Done' }).click();
  await page.waitForURL(/status=done/);
  await expect(page.getByTestId('idea-list')).toContainText('Climbing gym');
  await expect(page.getByTestId('idea-list')).not.toContainText('Pizza place');
});

test('edit updates title and category', async ({ page }) => {
  await signUp(page, makeTestUser('edt'));
  await createGroup(page, 'Edit Group');
  await createIdea(page, { title: 'Old idea name', category: 'other' });

  await page.getByRole('link', { name: 'Edit idea' }).click();
  await page.waitForURL(/\/edit$/);
  await page.getByLabel('Title').fill('New idea name');
  await page.getByLabel('Category').selectOption('event');
  await page.getByRole('button', { name: 'Save idea' }).click();

  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('idea-title')).toHaveText('New idea name');
  await expect(page.getByTestId('category-badge-event')).toBeVisible();
});

test('delete removes the idea after confirmation', async ({ page }) => {
  await signUp(page, makeTestUser('del'));
  const groupUrl = await createGroup(page, 'Delete Group');
  await createIdea(page, { title: 'Doomed idea', category: 'other' });

  await page.getByRole('button', { name: 'Delete idea' }).click();
  await page.getByRole('button', { name: 'Delete idea' }).click();

  await page.waitForURL(groupUrl);
  await expect(page.getByText('No ideas yet')).toBeVisible();
});

test('non-proposer member: no edit/delete controls, but can change status', async ({
  page,
  browser,
}) => {
  const admin = makeTestUser('adm');
  await signUp(page, admin);
  await createGroup(page, 'Shared Idea Group');
  await createIdea(page, { title: 'Admin idea', category: 'place' });
  const ideaUrl = page.url();

  // Invite a second member by link.
  await page.goto(ideaUrl.replace(/\/ideas\/.*$/, ''));
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

    await member.getByTestId('idea-list').getByRole('link').first().click();
    await member.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

    // UI gating: no edit/delete for the non-proposer.
    await expect(member.getByRole('link', { name: 'Edit idea' })).not.toBeVisible();
    await expect(member.getByRole('button', { name: 'Delete idea' })).not.toBeVisible();

    // But any member can change status.
    await member.getByRole('button', { name: 'Mark done' }).click();
    await expect(member.getByTestId('status-badge-done')).toBeVisible();
  } finally {
    await context.close();
  }
});

import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * Phase 12 — public, discoverable groups + request-to-join.
 * Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE=true and a live local stack.
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
    email: `e2e_pg_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_pg_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E PG ${tag}`,
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

async function createGroup(
  page: Page,
  opts: { name: string; description?: string; location?: string; tags?: string; public?: boolean },
): Promise<string> {
  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill(opts.name);
  if (opts.description) await page.getByLabel('Description').fill(opts.description);
  if (opts.location) await page.getByLabel('Location').fill(opts.location);
  if (opts.tags) await page.getByLabel('Tags').fill(opts.tags);
  if (opts.public) await page.getByRole('radio', { name: /Public/ }).check();
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  return page.url();
}

async function createIdea(page: Page, groupUrl: string, title: string) {
  await page.goto(groupUrl);
  await page.getByRole('link', { name: 'New idea' }).click();
  await page.waitForURL(/\/ideas\/new$/);
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Category').selectOption('food');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
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

test('public group: discover → request → admin approves → member sees contents', async ({
  page,
  browser,
}) => {
  const admin = makeTestUser('adm');
  const groupName = `Taco Crew ${Date.now()}`;

  await signUp(page, admin);
  const groupUrl = await createGroup(page, {
    name: groupName,
    description: 'We love tacos and good company',
    location: 'Austin, TX',
    tags: 'food, tacos',
    public: true,
  });

  // Hub banner reflects the public metadata.
  await expect(page.getByTestId('visibility-badge')).toContainText('Public');
  await expect(page.getByText('Austin, TX')).toBeVisible();
  await expect(page.getByText('#tacos')).toBeVisible();

  await createIdea(page, groupUrl, 'Secret Taco Spot');

  await inNewContext(browser, async (jp) => {
    const joiner = makeTestUser('jnr');
    await signUp(jp, joiner);

    // Discover + search for the group.
    await jp.goto('/discover');
    await jp.getByRole('searchbox', { name: 'Search' }).fill(groupName);
    await jp.getByRole('button', { name: 'Search' }).click();
    await jp.waitForURL(/\/discover\?/);

    const card = jp.getByTestId('discover-card').filter({ hasText: groupName });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Austin, TX');

    // Request to join → button flips to the withdraw state.
    await card.getByTestId('request-join').click();
    await expect(
      jp
        .getByTestId('discover-card')
        .filter({ hasText: groupName })
        .getByTestId('withdraw-request'),
    ).toBeVisible();

    // A non-member visiting the group hub is bounced to discovery.
    await jp.goto(groupUrl);
    await jp.waitForURL(/\/discover$/);

    // Admin approves the request from settings.
    await page.goto(`${groupUrl}/settings`);
    const reqRow = page.getByTestId('join-request-row').filter({ hasText: joiner.displayName });
    await expect(reqRow).toBeVisible();
    await reqRow.getByTestId('approve-request').click();
    await expect(page.getByTestId('join-requests')).toContainText('Join requests (0)');

    // Joiner is now a member: the hub renders and shows the contents.
    await jp.goto(groupUrl);
    await expect(jp).toHaveURL(new RegExp(`/groups/[0-9a-f-]{36}$`));
    await expect(jp.getByText('Members (2)')).toBeVisible();
    await expect(jp.getByTestId('idea-list')).toContainText('Secret Taco Spot');
  });
});

test('invite_only groups are not discoverable; rejected requests do not join', async ({
  page,
  browser,
}) => {
  const admin = makeTestUser('adm2');
  const privateName = `Secret Society ${Date.now()}`;
  const publicName = `Open Hikers ${Date.now()}`;

  await signUp(page, admin);
  await createGroup(page, { name: privateName }); // invite_only (default)
  const publicUrl = await createGroup(page, {
    name: publicName,
    location: 'Denver',
    tags: 'outdoors',
    public: true,
  });

  await inNewContext(browser, async (jp) => {
    await signUp(jp, makeTestUser('jnr2'));

    // The invite_only group never appears in discovery.
    await jp.goto('/discover');
    await jp.getByRole('searchbox', { name: 'Search' }).fill(privateName);
    await jp.getByRole('button', { name: 'Search' }).click();
    await jp.waitForURL(/\/discover\?/);
    await expect(jp.getByTestId('discover-results')).not.toContainText(privateName);

    // The public group is found via its tag filter; request to join.
    await jp.goto('/discover?tags=outdoors');
    const card = jp.getByTestId('discover-card').filter({ hasText: publicName });
    await expect(card).toBeVisible();
    await card.getByTestId('request-join').click();
    await expect(
      jp
        .getByTestId('discover-card')
        .filter({ hasText: publicName })
        .getByTestId('withdraw-request'),
    ).toBeVisible();

    // Admin rejects.
    await page.goto(`${publicUrl}/settings`);
    await page.getByTestId('join-request-row').getByTestId('reject-request').click();
    await expect(page.getByTestId('join-requests')).toContainText('Join requests (0)');

    // Joiner is still not a member — the hub bounces to discovery.
    await jp.goto(publicUrl);
    await jp.waitForURL(/\/discover$/);
  });
});

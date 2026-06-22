import { test, expect, type Page } from '@playwright/test';

/** Phase 14 — group wall / general chat. */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_wall_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_wall_${ts}_${r}`.slice(0, 30),
    displayName: 'Wall Tester',
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

test('member can post to the wall and delete their post', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Weekend Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  // Reach the wall via the hub link.
  await page.getByTestId('wall-link').click();
  await page.waitForURL(/\/wall$/);
  await expect(page.getByRole('heading', { name: 'Wall' })).toBeVisible();
  await expect(page.getByText('No posts yet. Start the conversation.')).toBeVisible();

  // Post.
  await page.getByLabel('Write something').fill('anyone free this weekend?');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('anyone free this weekend?')).toBeVisible();

  // Delete (two-step inline confirm).
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Delete this post?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No posts yet. Start the conversation.')).toBeVisible();
});

test('@mentions are highlighted in wall posts (16c)', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Mention Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByTestId('wall-link').click();
  await page.waitForURL(/\/wall$/);

  await page.getByLabel('Write something').fill('hey @movie_night who is in?');
  await page.getByRole('button', { name: 'Post' }).click();

  const mention = page.getByTestId('mention');
  await expect(mention).toHaveText('@movie_night');
  // The surrounding text is preserved around the highlighted token.
  await expect(page.getByTestId('wall-post')).toContainText('hey @movie_night who is in?');
});

test('an admin can pin and unpin a post (15e)', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Pin Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await page.getByTestId('wall-link').click();
  await page.waitForURL(/\/wall$/);

  await page.getByLabel('Write something').fill('Trip is ON for the 14th!');
  await page.getByRole('button', { name: 'Post' }).click();

  const post = page.getByTestId('wall-post').filter({ hasText: 'Trip is ON' });
  await expect(post).toHaveAttribute('data-pinned', 'false');

  // Pin → the post shows the pinned badge.
  await post.getByRole('button', { name: /Pin/ }).click();
  await expect(page.getByTestId('wall-post').filter({ hasText: 'Trip is ON' })).toHaveAttribute(
    'data-pinned',
    'true',
  );
  await expect(page.getByText('📌 Pinned')).toBeVisible();

  // Unpin.
  await page
    .getByTestId('wall-post')
    .filter({ hasText: 'Trip is ON' })
    .getByRole('button', { name: 'Unpin' })
    .click();
  await expect(page.getByTestId('wall-post').filter({ hasText: 'Trip is ON' })).toHaveAttribute(
    'data-pinned',
    'false',
  );
});

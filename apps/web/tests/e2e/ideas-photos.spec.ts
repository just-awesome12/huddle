import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5.3 — Idea photos: upload, replace, remove, and the
 * guessed-URL access check. Assumes NEXT_PUBLIC_TURNSTILE_TEST_MODE.
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
    email: `e2e_p53_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_p53_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E P53 ${tag}`,
  };
}

// 1×1 red PNG.
const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

async function setPhoto(page: Page, name: string) {
  await page.getByLabel(/Photo/).setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: PNG_FIXTURE,
  });
  // Compression runs on change; the submit button is disabled until done.
  await expect(page.getByText('Compressed in your browser before upload.')).toBeVisible();
}

test('create idea with photo → renders signed URL on detail', async ({ page }) => {
  await signUp(page, makeTestUser('up'));
  await createGroup(page, 'Photo Group');

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.getByLabel('Title').fill('Idea with photo');
  await setPhoto(page, 'photo.png');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  const img = page.getByTestId('idea-photo');
  await expect(img).toBeVisible();
  const src = (await img.getAttribute('src'))!;
  expect(src).toContain('/storage/v1/object/sign/idea-photos/');

  // The image actually loads (signed URL is valid).
  await expect
    .poll(async () =>
      img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
});

test('photo object is NOT readable without a signed URL', async ({
  page,
  request,
}) => {
  await signUp(page, makeTestUser('gs'));
  await createGroup(page, 'Guess Group');

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.getByLabel('Title').fill('Guarded photo');
  await setPhoto(page, 'guarded.png');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);

  const src = (await page.getByTestId('idea-photo').getAttribute('src'))!;
  // Extract "{group}/{idea}/{file}" from the signed URL.
  const objectPath = new URL(src).pathname.split('/object/sign/idea-photos/')[1]!;
  const storageOrigin = new URL(src).origin;

  // Unauthenticated direct fetches: the "public" route 400s for a
  // private bucket; the plain object route requires auth.
  const publicUrl = `${storageOrigin}/storage/v1/object/public/idea-photos/${objectPath}`;
  const directUrl = `${storageOrigin}/storage/v1/object/idea-photos/${objectPath}`;
  const publicRes = await request.get(publicUrl);
  const directRes = await request.get(directUrl);
  expect(publicRes.status()).toBeGreaterThanOrEqual(400);
  expect(directRes.status()).toBeGreaterThanOrEqual(400);
});

test('replace and remove photo from edit', async ({ page }) => {
  await signUp(page, makeTestUser('rm'));
  await createGroup(page, 'Replace Group');

  await page.getByRole('link', { name: 'New idea' }).click();
  await page.getByLabel('Title').fill('Mutable photo');
  await setPhoto(page, 'first.png');
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  const firstSrc = (await page.getByTestId('idea-photo').getAttribute('src'))!;

  // Replace.
  await page.getByRole('link', { name: 'Edit idea' }).click();
  await page.waitForURL(/\/edit$/);
  await setPhoto(page, 'second.png');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  const secondSrc = (await page.getByTestId('idea-photo').getAttribute('src'))!;
  expect(secondSrc).not.toBe(firstSrc);

  // Remove.
  await page.getByRole('link', { name: 'Edit idea' }).click();
  await page.waitForURL(/\/edit$/);
  await page.getByLabel('Remove current photo').check();
  await page.getByRole('button', { name: 'Save idea' }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('idea-photo')).not.toBeVisible();
});

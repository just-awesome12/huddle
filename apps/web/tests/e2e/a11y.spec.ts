import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 10.4 — accessibility sweep. Scans the key surfaces (signed-out
 * and signed-in) for serious/critical axe-core violations. Assumes
 * NEXT_PUBLIC_TURNSTILE_TEST_MODE and a live local stack.
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
    email: `e2e_a11y_${tag}_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_a11y_${tag}_${ts}_${r}`.slice(0, 30),
    displayName: `E2E A11Y ${tag}`,
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

/** Fail with a readable list if any serious/critical violations exist. */
async function expectNoSeriousA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = serious
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    .join('\n');
  expect(serious, `serious/critical a11y violations on ${label}:\n${summary}`).toEqual([]);
}

test('signed-out pages have no serious a11y violations', async ({ page }) => {
  // Scan the settled (resting) state: the auth panel's rise-in fade
  // momentarily blends text over its background, which axe would flag as
  // low-contrast mid-animation. Emulating reduced motion disables the
  // bespoke hud-* animations (see globals.css) so we assess final colours
  // — and confirms reduced-motion users get accessible contrast.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sign-in');
  await expectNoSeriousA11y(page, '/sign-in');
  await page.goto('/sign-up');
  await expectNoSeriousA11y(page, '/sign-up');
});

test('signed-in pages have no serious a11y violations', async ({ page }) => {
  await signUp(page, makeTestUser('in'));

  await expectNoSeriousA11y(page, '/groups');

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('A11y Group');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();
  await expectNoSeriousA11y(page, '/groups/[id]');

  // Add two ideas so the picker is usable.
  for (const title of ['Tacos', 'Ramen']) {
    await page.goto(groupUrl);
    await page.getByRole('link', { name: 'New idea' }).click();
    await page.waitForURL(/\/ideas\/new$/);
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Category').selectOption('food');
    await page.getByRole('button', { name: 'Add idea' }).click();
    await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  }

  await page.goto(`${groupUrl}/picker`);
  await expectNoSeriousA11y(page, '/groups/[id]/picker');

  await page.goto('/account');
  await expectNoSeriousA11y(page, '/account');

  await page.goto('/discover');
  await expectNoSeriousA11y(page, '/discover');
});

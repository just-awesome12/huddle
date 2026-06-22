import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 15c — picker "just decide" fallback: with only 1 on-radar idea but
 * a past `done` pick, the picker pulls the done idea into the pool instead
 * of refusing (the D63 ≥2 rule, satisfied via the do-again pool).
 */

function makeTestUser() {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 10000);
  return {
    email: `e2e_pfb_${ts}_${r}@huddle.test`,
    password: 'password123',
    username: `e2e_pfb_${ts}_${r}`.slice(0, 30),
    displayName: 'Fallback Picker',
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

test('picker falls back to a past pick when there is only 1 on-radar idea', async ({ page }) => {
  await signUp(page, makeTestUser());

  await page.goto('/groups/new');
  await page.getByLabel('Group name').fill('Decide Crew');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const hubUrl = page.url();

  // Quick-add an idea, mark it done → it becomes the fallback pool.
  await page.getByLabel('Quick-add an idea').fill('Old Plan');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByTestId('idea-list').getByText('Old Plan').click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByTestId('status-badge-done')).toBeVisible();

  // Back to the hub, add a single on-radar idea.
  await page.goto(hubUrl);
  await page.getByLabel('Quick-add an idea').fill('New Plan');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('idea-list').getByText('New Plan')).toBeVisible();

  // The picker is available (1 on-radar + 1 done) and announces the fallback.
  await page.getByTestId('picker-link').click();
  await page.waitForURL(/\/picker$/);
  await expect(page.getByText('Not enough ideas to pick from yet')).toHaveCount(0);
  await expect(page.getByText('including past picks')).toBeVisible();

  await page.getByTestId('picker-run').click();
  await expect(page.getByTestId('picker-result')).toBeVisible({ timeout: 10_000 });
  const chosen = (await page.getByTestId('picker-result-title').textContent())?.trim();
  expect(['Old Plan', 'New Plan']).toContain(chosen);
});

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Phase 15d — passwordless OTP sign-in (the "lower the auth wall" feature).
 * The local magic_link template renders a 6-digit {{ .Token }}; we read it
 * from Mailpit (the local mail catcher on :54324) and complete the flow.
 * A brand-new email creates the account → lands in onboarding.
 */

const MAILPIT = 'http://127.0.0.1:54324';

/** Poll Mailpit for the latest message to `email` and pull out its 6-digit code. */
async function readOtpCode(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await request
      .get(`${MAILPIT}/api/v1/messages?limit=10`)
      .then((r) => r.json())
      .catch(() => null);
    const msg = (list?.messages ?? []).find((m: { To?: { Address: string }[] }) =>
      (m.To ?? []).some((t) => t.Address.toLowerCase() === email.toLowerCase()),
    );
    if (msg) {
      const full = await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
      const blob = `${full.Text ?? ''} ${full.HTML ?? ''} ${full.Snippet ?? ''}`;
      const m = blob.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No OTP code found for ${email}`);
}

function freshEmail() {
  return `e2e_otp_${Date.now()}_${Math.floor(Math.random() * 10000)}@huddle.test`;
}

async function startOtp(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Email me a code instead/ }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code', exact: true }).click();
  await expect(page.getByText(/We emailed a 6-digit code/)).toBeVisible();
}

test('a new email gets a code, signs in, and lands in onboarding', async ({ page, request }) => {
  const email = freshEmail();
  await startOtp(page, email);

  const code = await readOtpCode(request, email);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: /Verify/ }).click();

  // Brand-new user → placeholder username → onboarding gate (D31/D32).
  await page.waitForURL(/\/onboarding/);
  await expect(
    page.getByRole('button', { name: /Continue|Finish|Save|Get started/i }),
  ).toBeVisible();
});

test('a wrong code is rejected with a clear message', async ({ page }) => {
  const email = freshEmail();
  await startOtp(page, email);

  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: /Verify/ }).click();

  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  // Still on the code step.
  await expect(page.getByLabel('6-digit code')).toBeVisible();
});

test('can switch back to password sign-in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Email me a code instead/ }).click();
  await expect(page.getByLabel('6-digit code').or(page.getByText(/Email me a code/))).toBeVisible();

  await page.getByRole('button', { name: /Sign in with a password instead/ }).click();
  await expect(page.getByLabel('Password')).toBeVisible();
});

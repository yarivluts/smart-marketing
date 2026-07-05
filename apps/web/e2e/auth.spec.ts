import { expect, test } from '@playwright/test';

function uniqueEmail(): string {
  return `e2e-${crypto.randomUUID()}@example.com`;
}

const PASSWORD = 'Sup3rSecret!';

test.describe('Firebase Auth: sign-up, sign-in, sign-out', () => {
  test('redirects an unauthenticated visitor away from the dashboard', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('lets a new user sign up, land on the dashboard, and sign out', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/en/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL(/\/en\/dashboard/);
    await expect(page.getByText(email)).toBeVisible();

    // A reload should keep the session (cookie-backed gate), no bounce to /login.
    await page.reload();
    await expect(page).toHaveURL(/\/en\/dashboard/);
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en\/login/);

    // Signed out now, the dashboard is gated again.
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('lets an existing user sign in from /login', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/en/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en\/login/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/en\/dashboard/);
    await expect(page.getByText(email)).toBeVisible();
  });

  test('rejects a forged session cookie even though it satisfies the middleware, and does not lock the visitor out of /login', async ({
    page,
    context,
  }) => {
    // The middleware (Edge runtime) only checks for the cookie's presence;
    // the dashboard page itself must verify it cryptographically via
    // firebase-admin (lib/auth/get-server-session.ts) to actually be secure.
    await context.addCookies([
      { name: 'growthos_session', value: 'forged-garbage-value', domain: '127.0.0.1', path: '/' },
    ]);
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login/);

    // Regression guard: middleware must not bounce this forged-but-present
    // cookie away from /login too, or the visitor could never re-authenticate.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('redirects an already-authenticated visitor away from /login back to the dashboard', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/en/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/);

    await page.goto('/en/login');
    await expect(page).toHaveURL(/\/en\/dashboard/);
  });

  test('shows an inline error for a wrong password', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/en/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });
});

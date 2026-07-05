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

import { expect, test, type Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/en/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Sup3rSecret!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

test.describe('AI Ad Studio (KAN-229)', () => {
  test('an owner opens the studio from the sidebar, creates an ad, and saves a scene script that keeps the rules', async ({ page }) => {
    test.setTimeout(90_000);
    await signUp(page, uniqueEmail('ad-studio'));
    await page.goto('/en/orgs/new');
    await page.getByLabel('Organization name').fill('Ad Studio E2E Org');
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByRole('heading', { name: 'Ad Studio E2E Org' })).toBeVisible();
    const orgId = new URL(page.url()).pathname.split('/').pop();

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Studio');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = new URL(page.url()).pathname.split('/').slice(-2)[0];

    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/campaigns`);
    await page.getByRole('link', { name: 'AI Ad Studio' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/ad-studio$`));
    await expect(page.getByRole('heading', { name: 'AI Ad Studio for Client Studio' })).toBeVisible();

    await page.getByLabel('Ad name').fill('Sign in 30 seconds');
    await page.getByLabel('What should the ad achieve?').fill('Trial signups from small law firms');
    await page.getByLabel('What is being sold, and to whom?').fill('E-signatures for lawyers');
    await page.getByRole('button', { name: 'Create ad' }).click();
    await expect(page).toHaveURL(/\?brief=/);

    await page.getByRole('button', { name: 'Add scene' }).click();
    const scene = page.getByTestId('ad-studio-scene-1');
    await expect(scene.getByText('Scene 1 needs a description of what the camera shows.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save script' })).toBeDisabled();
    await scene.getByLabel(/What the camera shows/).fill('A lawyer signs a contract on a phone');
    await scene.getByLabel('Voiceover').fill('Signed in seconds.');
    await page.getByRole('button', { name: 'Save script' }).click();
    await expect(page.getByText('Script saved.')).toBeVisible();
    await expect(page.getByText('5s of 60s').first()).toBeVisible();
  });
});

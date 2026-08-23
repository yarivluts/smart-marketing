import { expect, test, type Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

const PASSWORD = 'Sup3rSecret!';

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/en/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

async function createOrganization(page: Page, name: string): Promise<string> {
  await page.goto('/en/orgs/new');
  await page.getByLabel('Organization name').fill(name);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/en\/orgs\/[^/]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
  return page.url().split('/').pop()!;
}

test.describe('Churn Reasons (KAN-84)', () => {
  test('an org owner reaches the Churn Reasons page via nav, installs the pack, and sees the empty state', async ({ page }) => {
    const email = uniqueEmail('churn-reasons-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Churn Reasons E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Delta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Churn reasons' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/churn-reasons$`));
    await expect(page.getByRole('heading', { name: 'Churn reasons for Client Delta' })).toBeVisible();
    await expect(page.getByText('Install the Churn Reasons pack to start capturing cancellation reasons.')).toBeVisible();

    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No churn reasons landed for this project yet.').first()).toBeVisible({ timeout: 15_000 });
  });
});

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

test.describe('Billing ops feed (KAN-80)', () => {
  test('an org owner reaches the billing ops feed via nav and sees the empty state for a fresh project', async ({ page }) => {
    const email = uniqueEmail('billing-ops-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Billing Ops E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Billing ops feed' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/billing-ops-feed$`));
    await expect(page.getByRole('heading', { name: `Billing ops feed for Client Alpha` })).toBeVisible();
    await expect(page.getByText('No billing events landed for this project yet.')).toBeVisible();
    // KAN-94: a third section for subscriptions currently in dunning, alongside the existing churn one.
    await expect(page.getByRole('heading', { name: 'Subscriptions in dunning' })).toBeVisible();
    await expect(page.getByText('No subscriptions in dunning for this project yet.')).toBeVisible();
  });
});

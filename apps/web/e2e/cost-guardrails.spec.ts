import { expect, test, type Page } from '@playwright/test';
import { openMoreTools } from './test-utils/nav';

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

test.describe('Cost guardrails: set a project quota, see usage + labels reflected (KAN-39)', () => {
  test('an org owner views the default quota, sets one, and sees it reflected on the page', async ({ page }) => {
    await signUp(page, uniqueEmail('cost-guardrails-owner'));
    const orgId = await createOrganization(page, 'Cost Guardrails E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await openMoreTools(page);
    await page.getByRole('link', { name: 'Data usage limit' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/cost-guardrails$`));

    await expect(page.getByText("You haven't set a limit for this project yet — the standard daily limit applies.")).toBeVisible();
    await expect(page.getByText(/0 of 500 data requests used today/)).toBeVisible();
    await expect(page.getByText('No data requests yet for this project.')).toBeVisible();

    await page.getByLabel('Daily data request limit').fill('5');
    await page.getByLabel('Tags').fill('team=growth');
    await page.getByRole('button', { name: 'Save limit' }).click();

    await expect(page.getByText(/0 of 5 data requests used today/)).toBeVisible();
    await expect(page.getByText('Tags: team=growth')).toBeVisible();
  });
});

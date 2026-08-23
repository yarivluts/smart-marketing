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

test.describe('Campaign ops (KAN-86)', () => {
  test('an org owner reaches Campaign ops via nav, installs the payback pack, and sees both sections degrade cleanly with no warehouse configured', async ({ page }) => {
    const email = uniqueEmail('campaign-ops-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Campaign Ops E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Delta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Campaign ops' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/campaign-ops$`));
    await expect(page.getByRole('heading', { name: 'Campaign ops for Client Delta' })).toBeVisible();

    // Spend targets don't need the pack installed at all — no warehouse configured in this environment.
    await expect(page.getByText('No spend data available yet — connect a data warehouse to see this.')).toBeVisible();

    // Payback needs the Campaign Ops pack installed.
    await expect(page.getByText('No payback data available yet — connect a data warehouse to see this.')).not.toBeVisible();
    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No payback data available yet — connect a data warehouse to see this.')).toBeVisible({ timeout: 15_000 });
  });
});

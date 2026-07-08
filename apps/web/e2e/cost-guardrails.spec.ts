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

test.describe('Cost guardrails: set a project quota, see usage + labels reflected (KAN-39)', () => {
  test('an org owner views the default quota, sets one, and sees it reflected on the page', async ({ page }) => {
    await signUp(page, uniqueEmail('cost-guardrails-owner'));
    const orgId = await createOrganization(page, 'Cost Guardrails E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.getByRole('link', { name: 'Cost guardrails' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/cost-guardrails$`));

    await expect(page.getByText('No quota has been explicitly set for this project yet — the default limit applies.')).toBeVisible();
    await expect(page.getByText(/0 of 500 query attempts used today/)).toBeVisible();
    await expect(page.getByText('No metric queries logged for this project yet.')).toBeVisible();

    await page.getByLabel('Daily query limit').fill('5');
    await page.getByLabel('Labels').fill('team=growth');
    await page.getByRole('button', { name: 'Save quota' }).click();

    await expect(page.getByText(/0 of 5 query attempts used today/)).toBeVisible();
    await expect(page.getByText('Labels: team=growth')).toBeVisible();
  });
});

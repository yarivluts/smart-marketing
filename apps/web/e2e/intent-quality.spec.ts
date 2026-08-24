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

test.describe('Intent & Quality Scoring (KAN-83)', () => {
  test('an org owner reaches the Intent & quality page via nav, installs the pack, and sees the empty states', async ({ page }) => {
    const email = uniqueEmail('intent-quality-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Intent Quality E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Delta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Intent & quality' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/intent-quality$`));
    await expect(page.getByRole('heading', { name: `Intent & quality for Client Delta` })).toBeVisible();
    await expect(
      page.getByText('Install the Intent & Quality Scoring pack to start capturing onboarding-survey answers and computing a quality score at signup.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No onboarding-survey answers landed for this project yet.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No mix-shift alert history yet.')).toBeVisible();
  });
});

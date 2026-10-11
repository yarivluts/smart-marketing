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

test.describe('Experiments (KAN-89)', () => {
  test('an org owner reaches the Experiments page via nav, installs the pack, and sees the empty results state', async ({ page }) => {
    const email = uniqueEmail('experiments-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Experiments E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Delta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Experiments' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/experiments$`));
    await expect(page.getByRole('heading', { name: `Experiments for Client Delta` })).toBeVisible();
    await expect(page.getByText('Install the Experiment pack to start tracking exposures and conversions for your A/B tests.')).toBeVisible();

    await page.getByRole('button', { name: 'Install' }).click();
    // No BigQuery warehouse is wired up in this test env, so the results section degrades to its own
    // "connect a data warehouse" empty state — same posture Feedback/Firmographics/Campaign Ops assert.
    await expect(page.getByText('No results available yet — connect a data warehouse to see this.')).toBeVisible({ timeout: 15_000 });
  });
});

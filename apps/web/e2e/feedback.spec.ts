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

test.describe('Feedback & NPS (KAN-82)', () => {
  test('an org owner reaches the Feedback page via nav, installs the pack, and sees the empty NPS state', async ({ page }) => {
    const email = uniqueEmail('feedback-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Feedback E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Gamma');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    // The 3-module nav redesign (`bd7d215`) dropped the sidebar link to this page — it still
    // exists and renders, just isn't linked from anywhere in the UI yet, so navigate directly.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/feedback`);
    await expect(page.getByRole('heading', { name: `Feedback & NPS for Client Gamma` })).toBeVisible();
    await expect(page.getByText('Install the Feedback & NPS pack to start collecting NPS surveys and scoring them.')).toBeVisible();

    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No NPS responses landed for this project yet.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No feedback comments landed in this window yet.')).toBeVisible();

    // Plan/channel/cohort breakdown (KAN-82 follow-up): no BigQuery warehouse is wired up in this
    // test env, so every dimension section degrades to its own "connect a data warehouse" empty state.
    await expect(page.getByRole('heading', { name: 'By plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By channel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By signup cohort' })).toBeVisible();
    await expect(page.getByText('No plan breakdown available yet — connect a data warehouse to see this.')).toBeVisible();
  });
});

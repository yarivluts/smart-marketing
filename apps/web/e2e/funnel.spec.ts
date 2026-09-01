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

test.describe('Funnel conversion (query_funnel admin surface)', () => {
  test('an org owner reaches Funnel via nav and sees the Funnel & Goals cockpit for a fresh project', async ({ page }) => {
    const email = uniqueEmail('funnel-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Funnel E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Theta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Conversion', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/funnel$`));
    // The tri-module redesign (2026-08-31) replaced the old dedicated funnel page (which showed a
    // "no funnel confirmed yet" empty state for a project with no real data) with a unified
    // "Funnel, Goals & Revenue Health" cockpit that always synthesizes a full, zero-config view —
    // see `lib/orgs/funnel-goals-synthesizer.ts`'s own doc comment. No empty state exists anymore
    // to assert against; asserting the cockpit's own real, stable headings instead.
    await expect(page.getByRole('heading', { name: 'Funnel, Goals & Revenue Health' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conversion Funnel: Client Theta' })).toBeVisible();
  });
});

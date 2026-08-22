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

test.describe('Record feed (KAN-81)', () => {
  test('an org owner reaches the record feed via nav and sees the no-schemas empty state for a fresh project', async ({ page }) => {
    // Observed timing out waiting on the nav link under a loaded CI/sandbox runner (reproduced
    // identically against the unmodified, already-merged billing-ops-feed.spec.ts run alongside it) —
    // same "raise this test's own overall timeout to absorb runner slowness" fix `ingest-health.spec.ts`/
    // `plugins.spec.ts`/`tv-pairing.spec.ts` already established for this exact failure class.
    test.setTimeout(90_000);

    const email = uniqueEmail('record-feed-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Record Feed E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Beta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Record feed' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/record-feed$`));
    await expect(page.getByRole('heading', { name: `Record feed for Client Beta` })).toBeVisible();
    await expect(page.getByText('Register an event schema first to browse a record feed.')).toBeVisible();
  });
});

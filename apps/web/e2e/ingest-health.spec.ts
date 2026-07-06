import { expect, test, type Page } from '@playwright/test';
import { seedIngestFixture } from './test-utils/seed-ingest';

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

test.describe('Ingest health: throughput/error-rate rollup + quarantine browser (KAN-35)', () => {
  test('an org owner sees the ingest health rollup and quarantined records for seeded batches', async ({ page }) => {
    const email = uniqueEmail('ingest-health-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Ingest Health E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await seedIngestFixture({ organizationId: orgId, projectId, ownerEmail: email });

    await page.getByRole('link', { name: 'Ingest health' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/ingest-health$`));

    // Only one kind (event) was seeded, so the "Overall" and "Events" rows
    // render identical counts — scope to the "Overall" row specifically to
    // avoid an ambiguous match across both.
    const overallRow = page.getByRole('listitem').filter({ hasText: 'Overall' });
    await expect(overallRow).toContainText('4 records · 2 accepted · 1 quarantined · 1 duplicate');
    // Error rate counts quarantined records only (1/4), not the benign
    // duplicate — a retry storm must not read as a validation problem.
    await expect(overallRow).toContainText('25.0% error rate');

    await expect(page.getByText('ord-3 (Events, Prod)')).toBeVisible();
    await expect(page.getByText('Reasons: missing_required_field:amount')).toBeVisible();
    await expect(page.getByText("Replay isn't available yet")).toBeVisible();
  });

  test('shows the empty state for a project with no ingest batches yet', async ({ page }) => {
    await signUp(page, uniqueEmail('ingest-health-empty-owner'));
    const orgId = await createOrganization(page, 'Ingest Health Empty E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('link', { name: 'Ingest health' }).click();
    await expect(page.getByText('No ingest batches for this project yet.')).toBeVisible();
    await expect(page.getByText('No quarantined records among the batches shown above.')).toBeVisible();
  });
});

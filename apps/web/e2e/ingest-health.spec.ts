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
    // This test triggers a real orchestration run (KAN-38), which shells out to a real dbt build
    // (KAN-37) — normally a few seconds, but raising just this test's own overall timeout (not only the
    // individual assertion's) absorbs real subprocess slowness under a loaded CI/sandbox runner, since
    // Playwright's per-test `timeout` in `playwright.config.ts` caps every `expect(...)` inside a test
    // regardless of that assertion's own `timeout` option.
    test.setTimeout(90_000);

    const email = uniqueEmail('ingest-health-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Ingest Health E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

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

    // Replaying without first fixing the schema (KAN-34) leaves the record quarantined, with its
    // reasons re-surfaced inline rather than silently no-op'ing.
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByText('Still quarantined: missing_required_field:amount')).toBeVisible();

    // Orchestration (KAN-38): before triggering a run, there's no history and no freshness snapshot yet.
    await expect(page.getByText('No orchestration runs for this project yet.')).toBeVisible();
    await expect(page.getByText('No successful orchestration run yet.')).toBeVisible();

    // Triggering a run actually shells out to a real dbt build (KAN-37) against the buildable-today
    // DuckDB stand-in — normally a few seconds, but a generous 60s timeout here absorbs real subprocess
    // slowness under a loaded CI/sandbox runner (confirmed by hand: this genuinely completes, just not
    // always inside 30s under contention) rather than treating that as a UI-timing flake.
    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByText(/Succeeded · started/)).toBeVisible({ timeout: 60_000 });
    // This project was created through the product, not the dbt fixture's own hardcoded project ids, so
    // its freshness snapshot legitimately comes back with zero rows in every table — a real, honest
    // result of the whole run rather than a canned one (see `LocalDbtOrchestrationExecutor`'s own doc
    // comment for why).
    await expect(page.getByText('Entities: 0 rows · last landed never')).toBeVisible();
    await expect(page.getByText('Events: 0 rows · last landed never')).toBeVisible();
    await expect(page.getByText('Measures: 0 rows · last landed never')).toBeVisible();
  });

  test('shows the empty state for a project with no ingest batches yet', async ({ page }) => {
    await signUp(page, uniqueEmail('ingest-health-empty-owner'));
    const orgId = await createOrganization(page, 'Ingest Health Empty E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page — this
    // project is the org's only one, so the org page defaults its switcher to it without a `?project=`.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    await page.goto(`/en/orgs/${orgId}`);

    await page.getByRole('link', { name: 'Ingest health' }).click();
    await expect(page.getByText('No ingest batches for this project yet.')).toBeVisible();
    await expect(page.getByText('No quarantined records for this project.')).toBeVisible();
    await expect(page.getByText('No failed pipeline deliveries.')).toBeVisible();
    await expect(page.getByText('No orchestration runs for this project yet.')).toBeVisible();
    await expect(page.getByText('No successful orchestration run yet.')).toBeVisible();
  });
});

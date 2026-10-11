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

test.describe('Metric catalog: register an aggregation and a formula metric, invalid definitions rejected (KAN-40)', () => {
  test('an org owner registers an aggregation metric, evolves it, registers a formula referencing it, and an invalid formula is rejected', async ({ page }) => {
    await signUp(page, uniqueEmail('metric-owner'));
    const orgId = await createOrganization(page, 'Metric Catalog E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Metric catalog' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/metric-defs$`));
    await expect(page.getByText('No metrics registered for this project yet.')).toBeVisible();

    // Register v1: an aggregation metric summing ad spend.
    // "Column" is matched with `exact: true` — Playwright's default label
    // matching is substring-based, and "Time column" would otherwise also match.
    await page.getByLabel('Name').fill('ad_spend');
    await page.getByLabel('Table').fill('fact_ad_spend');
    await page.getByLabel('Column', { exact: true }).fill('reporting_spend');
    await page.getByLabel('Time column').fill('date');
    await page.getByRole('button', { name: 'Register metric' }).click();

    await expect(page.getByText('ad_spend', { exact: true })).toBeVisible();
    await expect(page.getByText('v1 — Active')).toBeVisible();
    await expect(page.getByText('sum(fact_ad_spend.reporting_spend)')).toBeVisible();

    // Everything from here on scopes to the metric family's own list item —
    // the always-visible "Register a new metric" form below has its own
    // "Table"/"Name" controls that would otherwise match too.
    const adSpendCard = page.getByRole('listitem').filter({ hasText: 'ad_spend' });

    // Evolve to v2: widen the dimensions this metric can be broken down by.
    await adSpendCard.getByRole('button', { name: 'Evolve' }).click();
    await expect(page.getByRole('heading', { name: 'Evolve "ad_spend" to a new version' })).toBeVisible();
    // Scoped to the family card — the always-visible "Register a new metric"
    // form below has its own "Dimensions (comma-separated)" field that would
    // otherwise also match once the evolve form (nested in this card) opens.
    await adSpendCard.getByLabel('Dimensions (comma-separated)').fill('channel, campaign');
    await adSpendCard.getByRole('button', { name: 'Evolve metric' }).click();

    await expect(adSpendCard.getByText('v1 — Superseded')).toBeVisible();
    await expect(adSpendCard.getByText('v2 — Active')).toBeVisible();
    await expect(adSpendCard.getByText('Dimensions: channel, campaign')).toBeVisible();

    // Register a second metric: a formula referencing the first, already-active one.
    await page.getByLabel('Name').fill('cost_ratio');
    await page.getByLabel('Definition kind').selectOption('formula');
    await page.getByLabel('Formula').fill('ad_spend / 2');
    await page.getByRole('button', { name: 'Register metric' }).click();

    await expect(page.getByText('cost_ratio', { exact: true })).toBeVisible();
    await expect(page.getByText('= ad_spend / 2')).toBeVisible();

    // Attempt an invalid formula: references a metric that was never registered.
    await page.getByLabel('Name').fill('broken_ratio');
    await page.getByLabel('Definition kind').selectOption('formula');
    await page.getByLabel('Formula').fill('ad_spend / never_registered');
    await page.getByRole('button', { name: 'Register metric' }).click();

    await expect(page.getByText(/Formula references unknown metric "never_registered"/)).toBeVisible();
    await expect(page.getByText('broken_ratio', { exact: true })).toHaveCount(0);
  });
});

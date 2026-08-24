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

test.describe('Rep collections (KAN-88)', () => {
  test('an org owner reaches Rep collections via nav, logs an activity against a person, and sees the leaderboard degrade cleanly with no warehouse configured', async ({ page }) => {
    // Spans signup, org create, project create, the org resource library, and this feature's own
    // page — more first-hit route compiles than the default 45s whole-test budget covers, the
    // same reason `boards`/`omnisearch`/`onboarding` raise theirs.
    test.setTimeout(180_000);
    const email = uniqueEmail('rep-collections-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Rep Collections E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Epsilon');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];

    // The activity ledger needs at least one person in the org's resource library.
    await page.goto(`/en/orgs/${orgId}/resources`);
    await page.locator('#person-name').fill('Alex Rep');
    await page.getByRole('button', { name: 'Add person' }).click();
    // The form clears its name field only after the POST succeeds, so wait on that before the
    // server-component refresh has necessarily painted the new row.
    await expect(page.locator('#person-name')).toHaveValue('', { timeout: 30_000 });
    await expect(page.getByRole('listitem').filter({ hasText: 'Alex Rep' })).toBeVisible({ timeout: 30_000 });

    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);
    await page.getByRole('link', { name: 'Rep collections' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/rep-collections$`));
    await expect(page.getByRole('heading', { name: 'Rep collections for Client Epsilon' })).toBeVisible();

    // The activity ledger works with no pack installed and no warehouse configured.
    await expect(page.getByText('No collections activity logged for this project yet.')).toBeVisible();
    await page.locator('#log-activity-customer-id').fill('cus_e2e_1');
    await page.locator('#log-activity-type').selectOption('payment_followup');
    await page.locator('#log-activity-note').fill('Chased the overdue invoice');
    await page.getByRole('button', { name: 'Log activity' }).click();
    await expect(page.getByText('Chased the overdue invoice')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('cus_e2e_1')).toBeVisible();

    // Owner assignment must work with no warehouse configured — otherwise the feature would be
    // unreachable until KAN-18 lands.
    await expect(page.getByText('No customers with collected revenue or a saved owner yet.')).toBeVisible();
    await page.locator('#assign-owner-customer-id').fill('cus_e2e_1');
    await page.getByRole('button', { name: 'Assign owner' }).click();
    await expect(page.getByLabel('Collections owner for cus_e2e_1')).toHaveValue(/.+/, { timeout: 15_000 });
    await expect(page.getByText('Not available yet')).toBeVisible();

    // The leaderboard needs the Rep Collections pack installed, then degrades on no warehouse.
    await expect(page.getByText('No collections data available yet — connect a data warehouse to see this.')).not.toBeVisible();
    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No collections data available yet — connect a data warehouse to see this.')).toBeVisible({ timeout: 15_000 });
  });
});

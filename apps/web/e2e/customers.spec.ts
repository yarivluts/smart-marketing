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

test.describe('Customer search (KAN-108)', () => {
  test('an org owner reaches Customers via nav and sees the no-entity-schemas empty state for a fresh project', async ({ page }) => {
    const email = uniqueEmail('customers-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Customers E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Epsilon');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/customers$`));
    await expect(page.getByRole('heading', { name: 'Customer search for Client Epsilon' })).toBeVisible();
    await expect(page.getByText('Register an entity schema first to search customers.')).toBeVisible();
  });

  test('an org owner registers an entity schema, searches, and sees the search degrade cleanly with no warehouse configured', async ({ page }) => {
    const email = uniqueEmail('customers-search-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Customers Search E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Zeta');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    // Register a "customer" entity schema so the search form itself renders.
    await page.getByRole('link', { name: 'Schema registry' }).click();
    await page.getByLabel('Kind').selectOption('entity');
    await page.getByLabel('Name', { exact: true }).fill('customer');
    await page.getByLabel('Field name').fill('email');
    await page.getByRole('button', { name: 'Register schema' }).click();
    await expect(page.getByText('entity: customer')).toBeVisible();

    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/customers$`));

    // No query yet — a prompt, not a warehouse call.
    await expect(page.getByText('Enter a search term to look up a customer.')).toBeVisible();

    await page.getByLabel('Search').fill('alice@example.com');
    await page.getByRole('button', { name: 'Search customers' }).click();

    await expect(page).toHaveURL(/[?&]q=alice%40example\.com/);
    await expect(page.getByText('Customer search unavailable (warehouse not configured yet)')).toBeVisible();
  });
});

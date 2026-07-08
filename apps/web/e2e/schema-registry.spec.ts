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

test.describe('Schema Registry: register v1, evolve to v2, breaking change rejected (KAN-31)', () => {
  test('an org owner registers a schema, evolves it, and a breaking evolution is rejected', async ({ page }) => {
    await signUp(page, uniqueEmail('schema-owner'));
    const orgId = await createOrganization(page, 'Schema Registry E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.getByRole('link', { name: 'Schema registry' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/schema-defs$`));
    await expect(page.getByText('No schemas registered for this project yet.')).toBeVisible();

    // Register v1: an "order_completed" event with one required field.
    await page.getByLabel('Kind').selectOption('event');
    await page.getByLabel('Name', { exact: true }).fill('order_completed');
    await page.getByLabel('Field name').fill('order_id');
    await page.getByRole('checkbox', { name: 'Required' }).check();
    await page.getByRole('button', { name: 'Register schema' }).click();

    await expect(page.getByText('event: order_completed')).toBeVisible();
    await expect(page.getByText('v1 — Active')).toBeVisible();
    await expect(page.getByText('order_id')).toBeVisible();

    // Everything from here on scopes to the schema family's own list item —
    // the always-visible "Register a new schema" form below has its own
    // "Add field"/"Field name"/"Remove" controls that would otherwise match too.
    const familyCard = page.getByRole('listitem');

    // Evolve to v2: add a new optional field.
    await page.getByRole('button', { name: 'Evolve' }).click();
    await expect(page.getByRole('heading', { name: 'Evolve event "order_completed" to a new version' })).toBeVisible();
    await familyCard.getByRole('button', { name: 'Add field' }).click();
    await familyCard.getByLabel('Field name').last().fill('currency');
    await page.getByRole('button', { name: 'Evolve schema' }).click();

    await expect(page.getByText('v1 — Superseded')).toBeVisible();
    await expect(page.getByText('v2 — Active')).toBeVisible();
    await expect(page.getByText('currency')).toBeVisible();

    // Attempt a breaking evolution: remove the pre-existing required field.
    await page.getByRole('button', { name: 'Evolve' }).click();
    await familyCard.getByRole('button', { name: 'Remove' }).first().click();
    await page.getByRole('button', { name: 'Evolve schema' }).click();

    await expect(page.getByText(/This change would break existing consumers/)).toBeVisible();
    // Rejected — still only two versions, v2 still the active one.
    await expect(page.getByText('v2 — Active')).toBeVisible();
    await expect(page.getByText('v3 — Active')).toHaveCount(0);

    // KAN-36: the registered event schema shows up in the volume/tracking-alerts
    // section, honestly reporting "never received a record" since this test never
    // ingests any real data — and a manual "Check now" leaves it that way (nothing
    // to have "broken" yet).
    await expect(page.getByText('order_completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Never received a record.')).toBeVisible();
    await expect(page.getByText('No tracking alerts for this project yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText('No tracking alerts for this project yet.')).toBeVisible();
  });
});

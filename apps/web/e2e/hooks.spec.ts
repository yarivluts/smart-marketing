import { expect, test, type Page } from '@playwright/test';
import { seedHookDelivery } from './test-utils/seed-hook-delivery';

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

test.describe('Inbound hooks: create endpoint, copy receive URL, review queue (KAN-53)', () => {
  test('an org owner creates a hook endpoint, copies its receive URL, and sees a posted delivery in the review queue', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signUp(page, uniqueEmail('hooks-owner'));
    const orgId = await createOrganization(page, 'Hooks E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Inbound hooks' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/hooks$`));
    await expect(page.getByText('No hook endpoints created for this project yet.')).toBeVisible();

    await page.getByLabel('Name').fill('Zapier');
    await page.getByLabel('Environment').selectOption({ label: 'Prod' });
    await page.getByRole('button', { name: 'Create endpoint' }).click();

    // The "no signature check" copy also appears as a `<select>` option in the create form further
    // down this same page — scope to the endpoint's own list item to avoid Playwright's strict-mode
    // ambiguity error over which element `getByText` should resolve to.
    const endpointRow = page.getByRole('listitem').filter({ hasText: 'Zapier (Prod)' });
    await expect(endpointRow).toBeVisible();
    await expect(endpointRow.getByText('No signature check (URL is the credential)')).toBeVisible();

    await page.getByRole('button', { name: 'Copy URL' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const receiveUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(receiveUrl).toMatch(/\/v1\/hooks\/[^/]+$/);
    const hookId = receiveUrl.split('/').pop()!;

    // `apps/api` (the real `/v1/hooks/:hookId` receiver) isn't part of this app's own e2e `webServer`
    // (same posture `seedIngestFixture` established for the ingest API) — land the delivery directly
    // through the same service function the route calls, proving the receive URL's token is genuinely
    // the one this endpoint's delivery gets filed under.
    await seedHookDelivery({ hookId, rawBody: JSON.stringify({ order_id: 'ord_1', amount: 42 }) });

    // `seedHookDelivery` writes through a separate Node process (this spec file, not the Next.js
    // server under test) against the same Firestore emulator — a single `reload()` right after can
    // race the write landing before the server's own next read. Poll instead of reloading once.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(/— Pending review$/)).toBeVisible();
    }).toPass({ timeout: 15_000 });
    await expect(page.locator('pre')).toContainText('"order_id":"ord_1"');

    await page.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByText(/— Reviewed$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy URL' })).toHaveCount(0);
  });
});

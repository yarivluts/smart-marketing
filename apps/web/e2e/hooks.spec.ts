import { expect, test, type Page } from '@playwright/test';
import { seedHookPayload } from './test-utils/seed-hooks';

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

test.describe('Inbound webhooks: create endpoint, copy-once secret, revoke, review queue (KAN-53)', () => {
  test('an org owner creates hook endpoints, sees a signing secret exactly once, revokes one, and reviews a landed payload', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const email = uniqueEmail('hooks-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Hooks E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.getByRole('link', { name: 'Inbound webhooks' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/hooks$`));
    await expect(page.getByText('No hook endpoints created for this project yet.')).toBeVisible();
    await expect(page.getByText('No payloads pending review.')).toBeVisible();

    // Create a none-mode endpoint: no signing secret, just a URL to paste into a third-party SaaS.
    await page.getByLabel('Name').fill('Shopify orders');
    await page.getByLabel('Environment').selectOption({ label: 'Prod' });
    await page.getByRole('button', { name: 'Create hook endpoint' }).click();
    await expect(page.getByTestId('minted-hook-url-display')).toBeVisible();
    const noneModeHookUrl = await page.getByTestId('minted-hook-url-display').locator('code').innerText();
    expect(noneModeHookUrl).toMatch(new RegExp(`/v1/hooks/${projectId}/`));
    await page.getByTestId('minted-hook-url-display').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Shopify orders')).toBeVisible();
    await expect(page.getByText('Signature verification: None — accept any payload')).toBeVisible();

    // Create an hmac_sha256 endpoint: the raw signing secret is shown exactly once.
    await page.getByLabel('Name').fill('Custom CRM');
    await page.getByRole('radio', { name: /HMAC-SHA256/ }).check();
    await page.getByRole('button', { name: 'Create hook endpoint' }).click();
    await expect(page.getByText("Copy the URL and signing secret now — the secret won't be shown again.")).toBeVisible();
    const secretDisplay = page.getByTestId('minted-hook-signing-secret-display');
    const hookUrl = await secretDisplay.locator('code').first().innerText();
    const rawSecret = await secretDisplay.getByTestId('minted-hook-signing-secret-value').innerText();
    expect(hookUrl).toMatch(new RegExp(`/v1/hooks/${projectId}/`));
    const hookEndpointId = hookUrl.split('/').pop()!;

    await secretDisplay.getByRole('button', { name: 'Copy' }).click();
    await expect(secretDisplay.getByRole('button', { name: 'Copied' })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(rawSecret);

    await secretDisplay.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText("Copy the URL and signing secret now — the secret won't be shown again.")).not.toBeVisible();
    await expect(page.getByText('Custom CRM')).toBeVisible();
    // The raw secret is never shown again after dismissal.
    await expect(page.getByText(rawSecret, { exact: true })).toHaveCount(0);

    // Revoke the none-mode endpoint; the hmac endpoint stays live.
    const shopifyRow = page.getByRole('listitem').filter({ hasText: 'Shopify orders' });
    await shopifyRow.getByRole('button', { name: 'Revoke' }).click();
    await expect(shopifyRow.getByText('Revoked')).toBeVisible();
    await expect(shopifyRow.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
    const crmRow = page.getByRole('listitem').filter({ hasText: 'Custom CRM' });
    await expect(crmRow.getByRole('button', { name: 'Revoke' })).toBeVisible();

    // Land a payload on the live hmac endpoint (no UI path to POST to it — apps/api isn't part of
    // this app's own e2e webServer, same as `seed-ingest.ts`) and confirm it shows up for review.
    await seedHookPayload({ organizationId: orgId, projectId, hookEndpointId });
    await page.reload();
    await expect(page.getByText(/Custom CRM — signature: missing — received/)).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('No payloads pending review.')).toBeVisible();
  });
});

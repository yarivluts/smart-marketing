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

// hmac_sha256 endpoint creation (KMS-encrypted signing secret) needs `GROWTHOS_VAULT_KEYS`, which
// this app's e2e `webServer` (`playwright.config.ts`) doesn't set — the same reason
// `resource-library.spec.ts` never drives a shared credential's "set secret" form through the UI
// either. That path is already covered deterministically at the service/route layer
// (`hook-endpoint.emulator.test.ts`, `hooks/route.test.ts`, `hooks.controller.e2e.spec.ts`) and at
// the component layer (`create-hook-endpoint-form.test.tsx`). This spec exercises the `none`-mode
// path end to end instead: create, the hook URL shown once, the review queue, dismiss, and revoke.
test.describe('Inbound webhooks: create endpoint, review queue, revoke (KAN-53)', () => {
  test('an org owner creates a hook endpoint, reviews a landed payload, and revokes it', async ({ page }) => {
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

    await page.getByLabel('Name').fill('Shopify orders');
    await page.getByLabel('Environment').selectOption({ label: 'Prod' });
    await page.getByRole('button', { name: 'Create hook endpoint' }).click();
    await expect(page.getByTestId('minted-hook-url-display')).toBeVisible();
    const hookUrl = await page.getByTestId('minted-hook-url-display').locator('code').innerText();
    expect(hookUrl).toMatch(new RegExp(`/v1/hooks/${projectId}/`));
    const hookEndpointId = hookUrl.split('/').pop()!;

    await page.getByTestId('minted-hook-url-display').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Shopify orders')).toBeVisible();
    await expect(page.getByText('Signature verification: None — accept any payload')).toBeVisible();

    // Land a payload on the live endpoint (no UI path to POST to it — apps/api isn't part of this
    // app's own e2e webServer, same reasoning as `seed-ingest.ts`) and confirm it shows up for review.
    await seedHookPayload({ organizationId: orgId, projectId, hookEndpointId });
    await page.reload();
    await expect(page.getByText(/Shopify orders — signature: not checked — received/)).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('No payloads pending review.')).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Revoked')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });
});

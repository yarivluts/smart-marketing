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

test.describe('Onboarding wizard: pack -> connect a source -> confirm funnel -> starter board (KAN-68)', () => {
  test('a new org owner walks the whole wizard end to end', async ({ page }) => {
    // Installing the SaaS metric pack registers 22 metric definitions sequentially — the same
    // real-write budget `pack/route.test.ts` and `metric-pack-dispatch.emulator.test.ts` both raise
    // their own timeout for.
    test.setTimeout(120_000);
    await signUp(page, uniqueEmail('onboarding-owner'));
    const orgId = await createOrganization(page, 'Onboarding E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();

    // Creating a project lands straight on the onboarding wizard (KAN-68), not the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    await expect(page.getByRole('heading', { name: 'Get Client Alpha set up' })).toBeVisible();
    await page.getByRole('button', { name: 'Start onboarding' }).click();

    // Step 1: pick the built-in SaaS/marketing metric pack.
    await expect(page.getByRole('heading', { name: 'Pick a starting point' })).toBeVisible();
    await page.getByRole('button', { name: /SaaS & Marketing Metrics/ }).click();
    await expect(page.getByRole('heading', { name: 'Connect a data source' })).toBeVisible({ timeout: 60_000 });

    // Step 2: mint an ingest.write key ("push your own data"), then continue.
    await page.getByLabel('Name').fill('Website snippet');
    await page.getByRole('checkbox', { name: 'ingest.write' }).check();
    await page.getByRole('button', { name: 'Create key' }).click();
    await expect(page.getByText("Copy this key now — it won't be shown again.")).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: no events ingested yet, so the AI-proposed funnel is empty — confirm anyway.
    await expect(page.getByText("This project hasn't received any events yet")).toBeVisible();
    await page.getByRole('button', { name: 'Confirm funnel' }).click();

    // Step 4: the pack's three starter boards + the invite/goal/war-room CTAs + finish.
    await expect(page.getByRole('heading', { name: 'Your starter board' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Marketing' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revenue / MRR' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Funnel' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Invite your team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Set a goal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Turn on the war room' })).toBeVisible();

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText("You're all set!")).toBeVisible();
  });
});

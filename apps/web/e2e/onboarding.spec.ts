import { expect, test, type Page } from '@playwright/test';
import { seedFunnelSetOverMcp } from './test-utils/seed-funnel';

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
    // Installing the SaaS metric pack registers 22 metric definitions sequentially against the same
    // Firestore emulator every other suite in this CI run shares — the same real-write budget
    // `packages/firebase-orm-models`'s emulator tests get from their 120s package-wide `testTimeout`
    // (raised by KAN-19/PR #73 for exactly this documented gRPC `RESOURCE_EXHAUSTED` backoff). This
    // step previously waited only 60s for the pack-install response, which a real CI run (2026-07-20,
    // workflow run 29745281389) wasn't enough for — the backoff pushed the wait past 60s, and every
    // one of Playwright's 2 retries then failed too (the emulator was still recovering). Match the
    // 120s ceiling here and give the whole test enough total budget to cover it.
    test.setTimeout(180_000);
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
    await expect(page.getByRole('heading', { name: 'Connect a data source' })).toBeVisible({ timeout: 120_000 });

    // A brand-new org has no source manifests registered yet, so the empty-state CTA must be a real,
    // visible button linking to the org's plugin registry — not buried inline text a first-time user
    // reads past (found via dogfooding QA, 2026-08-16: "no link/button to the pack registry").
    const registryLink = page.getByRole('link', { name: 'Register one from the plugin registry' });
    await expect(registryLink).toBeVisible();
    await expect(registryLink).toHaveAttribute('href', `/en/orgs/${orgId}/plugins`);

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
    // exact: true - the persistent sidebar's own "Funnel & Goals" primary-module link also
    // contains "Funnel" as a substring, which Playwright's default name matching would otherwise
    // match ambiguously alongside this starter board link.
    await expect(page.getByRole('link', { name: 'Funnel', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Invite your team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Set a goal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Turn on the war room' })).toBeVisible();

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText("You're all set!")).toBeVisible();
  });

  /*
    KAN-199: a funnel can be set by an agent over MCP (set_funnel) for a project whose humans never
    opened the wizard. It writes the wizard's own storage, so it must show up here - readable, and
    editable without walking the wizard - and the Funnel page must treat it as defined.
  */
  test('a funnel set over MCP shows up in the wizard, is editable there, and counts as defined on the Funnel page', async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail('onboarding-mcp-funnel');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Onboarding MCP Funnel Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Sigma');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];

    await seedFunnelSetOverMcp({ organizationId: orgId, projectId, ownerEmail: email, eventSchemaNames: ['touchpoint', 'signup', 'document_signed'] });
    await page.reload();

    const summary = page.getByTestId('onboarding-confirmed-funnel');
    await expect(summary.getByRole('heading', { name: 'Your confirmed funnel' })).toBeVisible();
    await expect(summary.getByRole('listitem')).toHaveText([/touchpoint/, /signup/, /document_signed/]);

    // Editing starts from the confirmed funnel, not a fresh proposal: drop the middle step.
    await summary.getByRole('link', { name: 'Edit funnel' }).click();
    await expect(page).toHaveURL(/\/onboarding\?editFunnel=1$/);
    await expect(page.getByRole('checkbox', { name: 'signup' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'signup' }).uncheck();
    await page.getByRole('button', { name: 'Confirm funnel' }).click();

    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/onboarding$`));
    await expect(page.getByTestId('onboarding-confirmed-funnel').getByRole('listitem')).toHaveText([/touchpoint/, /document_signed/]);

    // The Funnel page reads the same funnel: it may be unable to COUNT it (no warehouse in this
    // environment), but it must not claim no funnel is defined.
    await page.getByTestId('onboarding-confirmed-funnel').getByRole('link', { name: 'View conversion' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/funnel$`));
    await expect(page.getByRole('heading', { name: 'Funnel, Goals & Revenue Health' })).toBeVisible();
    await expect(page.getByText('No funnel is defined for this project yet')).toHaveCount(0);
  });
});

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

test.describe('Org Resource Library: create, request, approve, detach (KAN-27)', () => {
  test('an owner adds a shared credential, a project requests + gets approved a scoped slice, then detaches it', async ({
    page,
  }) => {
    await signUp(page, uniqueEmail('resource-owner'));
    const orgId = await createOrganization(page, 'Resource Library E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.getByRole('link', { name: 'Resource library' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/resources$`));
    // "Name" is ambiguous on this page (the credential/template/person create
    // forms each have their own), so target the credential form by its id.
    await page.locator('#credential-name').fill('Shared Meta MCC');
    await page.getByLabel('Provider').selectOption('meta_ads');
    await page.getByLabel('Available scopes').fill('act_111, act_222');
    await page.getByRole('button', { name: 'Add credential' }).click();
    await expect(page.getByText('Shared Meta MCC (meta_ads, 2 available scopes)')).toBeVisible();

    // Request attaching it to the project, selecting only one of the two available scopes.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/resources`);
    await page.getByLabel('Scopes to request (comma-separated)').fill('act_111');
    await page.getByRole('button', { name: 'Request' }).click();
    await expect(page.getByText('Status: pending')).toBeVisible();

    // Approve it from the org resource library's pending-requests queue.
    await page.goto(`/en/orgs/${orgId}/resources`);
    await expect(page.getByText('Client Alpha requests credential "Shared Meta MCC"')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('No pending requests.')).toBeVisible();

    // The project sees only its granted slice (act_111, never act_222), and can detach it —
    // detaching frees the resource back up for a fresh request.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/resources`);
    await expect(page.getByText('Status: approved (act_111)')).toBeVisible();
    await page.getByRole('button', { name: 'Detach' }).click();
    await expect(page.getByRole('button', { name: 'Request' })).toBeVisible();
  });
});

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

test.describe('Global omnisearch (KAN-85)', () => {
  test('an org owner opens the palette with Cmd/Ctrl+K, searches by name, and jumps to the matching board', async ({ page }) => {
    // Same "first-compile-in-this-run" budget boards.spec.ts raises for itself — this flow visits
    // the onboarding wizard, org page, metric catalog, and boards pages before the palette is even
    // exercised.
    test.setTimeout(120_000);
    await signUp(page, uniqueEmail('omnisearch-owner'));
    const orgId = await createOrganization(page, 'Omnisearch E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await page.getByRole('link', { name: 'Boards' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards$`));
    await page.getByLabel('Name').fill('Marketing Overview');
    await page.getByRole('button', { name: 'Create board' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards/[^/]+$`), { timeout: 20_000 });
    const boardId = page.url().split('/').pop()!;

    // Navigate elsewhere first, so opening the palette is a real "jump from anywhere" — not just a
    // reload of the board page it's about to navigate back to.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/metric-defs`);

    // No dialog until the shortcut is pressed.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    const input = page.getByPlaceholder(/search boards, metrics/i);
    await input.fill('marketing');
    const result = page.getByRole('option', { name: /Marketing Overview/ });
    await expect(result).toBeVisible();
    await result.click();

    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards/${boardId}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Marketing Overview' })).toBeVisible();
  });

  test('typing a query with no matches shows an empty state, and Escape closes the palette', async ({ page }) => {
    test.setTimeout(60_000);
    await signUp(page, uniqueEmail('omnisearch-empty'));
    const orgId = await createOrganization(page, 'Omnisearch Empty E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Beta');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));

    await page.getByRole('button', { name: /search/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Start typing to search this project.')).toBeVisible();

    await page.getByPlaceholder(/search boards, metrics/i).fill('nothing-should-match-this-xyz');
    await expect(page.getByText('No results for "nothing-should-match-this-xyz".')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

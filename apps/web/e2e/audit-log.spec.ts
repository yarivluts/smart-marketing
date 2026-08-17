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

test.describe('Audit log (KAN-44): entries render, chain verifies, quoted summaries survive RTL', () => {
  test('a board-create entry appears with a valid chain, and its summary text is not bidi-reordered under /he/', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page, uniqueEmail('audit-owner'));
    const orgId = await createOrganization(page, 'Audit E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];

    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/boards`);
    await page.getByLabel('Name').fill('Quote Test Board');
    await page.getByRole('button', { name: 'Create board' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards/[^/]+$`), { timeout: 20_000 });

    await page.goto(`/en/orgs/${orgId}/audit-log`);
    await expect(page.getByText('Chain verified')).toBeVisible();
    const enSummary = page.locator('span.font-medium').first();
    await expect(enSummary).toHaveText('Created board "Quote Test Board"');
    await expect(enSummary).toHaveAttribute('dir', 'ltr');

    // `entry.summary` is raw, untranslated English generated server-side — un-isolated in an RTL
    // page, the bidi algorithm treats its quote marks as weak/neutral and reorders them (found via
    // session-B dogfooding QA, 2026-08-17: "Created board" rendered with a leading stray quote and
    // the closing one missing). `dir="ltr"` on the span isolates it; assert the text itself — not
    // just the attribute — since bidi reordering doesn't change `textContent`, only visual order,
    // so this assertion alone wouldn't have caught the original bug without the `dir` check above.
    await page.goto(`/he/orgs/${orgId}/audit-log`);
    const heSummary = page.locator('span.font-medium').first();
    await expect(heSummary).toHaveText('Created board "Quote Test Board"');
    await expect(heSummary).toHaveAttribute('dir', 'ltr');
  });
});

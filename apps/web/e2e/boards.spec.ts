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

test.describe('Dashboard boards: create a board, add tiles via the grid editor, layout persists (KAN-60)', () => {
  test('an org owner builds a board with tiles and their layout survives a reload', async ({ page }) => {
    // This flow visits more distinct, first-compile-in-this-run pages (onboarding wizard, org,
    // project, metric catalog, boards list, board detail) than most other specs — the same
    // "cold dev-server compile" budget `ingest-health.spec.ts`/`plugins.spec.ts` already raise
    // their own timeout for. The onboarding wizard (KAN-68) now sits in this path too, on top of
    // the org page, since project creation lands there first.
    test.setTimeout(120_000);
    await signUp(page, uniqueEmail('board-owner'));
    const orgId = await createOrganization(page, 'Board E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project now lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    // A board's tile picker only offers registered, active metrics — register one first.
    await page.getByRole('link', { name: 'Metric catalog' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/metric-defs$`));
    await page.getByLabel('Name').fill('ad_spend');
    await page.getByLabel('Table').fill('fact_ad_spend');
    await page.getByLabel('Column', { exact: true }).fill('reporting_spend');
    await page.getByLabel('Time column').fill('date');
    await page.getByRole('button', { name: 'Register metric' }).click();
    await expect(page.getByText('ad_spend', { exact: true })).toBeVisible();

    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);
    await page.getByRole('link', { name: 'Boards' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards$`));
    await expect(page.getByText('This project has no boards yet.')).toBeVisible();

    await page.getByLabel('Name').fill('Marketing');
    await page.getByRole('button', { name: 'Create board' }).click();
    // A generous timeout: this is the very first visit to the dynamic
    // `boards/[boardId]` route in this dev-server process, so the
    // client-side navigation waits on an on-demand compile, not just a
    // network round trip.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards/[^/]+$`), { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Marketing' })).toBeVisible();
    await expect(page.getByText('This board has no tiles yet. Click "Edit layout" to add one.')).toBeVisible();

    // Build a tile: enter edit mode, add one, give it a title, save.
    await page.getByRole('button', { name: 'Edit layout' }).click();
    await page.getByRole('button', { name: 'Add tile' }).click();
    await page.getByLabel('Tile title').fill('Ad spend');
    await page.getByRole('button', { name: 'Save layout' }).click();

    await expect(page.getByRole('button', { name: 'Edit layout' })).toBeVisible();
    await expect(page.getByText('Ad spend')).toBeVisible();
    // No real warehouse exists in this environment (KAN-18) — the tile honestly
    // degrades instead of showing fabricated data or breaking the whole board.
    await expect(page.getByText('Warehouse not configured yet')).toBeVisible();

    // Layout persists (KAN-60 AC): reload and the tile is still there.
    await page.reload();
    await expect(page.getByText('Ad spend')).toBeVisible();
    await expect(page.getByText('Warehouse not configured yet')).toBeVisible();

    // Add a second tile, then remove the first — both a multi-tile board and
    // a remove-then-save round trip.
    await page.getByRole('button', { name: 'Edit layout' }).click();
    await page.getByRole('button', { name: 'Add tile' }).click();
    const titleInputs = page.getByLabel('Tile title');
    await expect(titleInputs).toHaveCount(2);
    await titleInputs.nth(1).fill('Second tile');
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(titleInputs).toHaveCount(1);
    await page.getByRole('button', { name: 'Save layout' }).click();
    await expect(page.getByText('Second tile')).toBeVisible();
    await expect(page.getByText('Ad spend')).toHaveCount(0);

    // Board-level settings: rename, and it's reflected as the page heading.
    await page.getByLabel('Name', { exact: true }).first().fill('Revenue');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();

    // Delete the board — back on the (now empty again) boards list.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete board' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards$`));
    await expect(page.getByText('This project has no boards yet.')).toBeVisible();
  });
});

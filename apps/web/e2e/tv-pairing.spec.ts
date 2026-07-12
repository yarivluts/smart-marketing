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

test.describe('War-room TV mode: pair a TV with a real code, manage it from the admin page (KAN-67)', () => {
  test('the TV mode URL shows a pairing code with no login, and an admin can claim it', async ({ page }) => {
    // First-compile-in-this-run visits (org, project, boards, tv-pairing admin page, tv kiosk page).
    test.setTimeout(90_000);
    await signUp(page, uniqueEmail('tv-owner'));
    const orgId = await createOrganization(page, 'TV Pairing E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);
    await page.getByRole('link', { name: 'Boards' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards$`));
    await page.getByLabel('Name').fill('Marketing');
    await page.getByRole('button', { name: 'Create board' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/boards/[^/]+$`), { timeout: 20_000 });

    // The TV kiosk page requires no login of its own — visiting it mints a
    // fresh pairing and displays the code, with no session/redirect.
    await page.goto('/en/tv');
    await expect(page.getByText('Pair this TV')).toBeVisible({ timeout: 20_000 });
    const codeLocator = page.locator('p[aria-label^="Pairing code "]');
    await expect(codeLocator).toBeVisible();
    const code = (await codeLocator.textContent())!.trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Back as the signed-in admin: pair that exact TV via the real form.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/tv`);
    await expect(page.getByText('No TVs are paired to this project yet.')).toBeVisible();
    await page.getByLabel('Pairing code').fill(code);
    await page.getByLabel('TV label').fill('Office lobby');
    await page.getByLabel('Marketing').check();
    await page.getByRole('button', { name: 'Pair TV' }).click();

    await expect(page.getByText('Office lobby')).toBeVisible();
    await expect(page.getByText('No TVs are paired to this project yet.')).toHaveCount(0);

    // The TV itself transitions off the pairing screen once claimed (it
    // polls `/api/tv-pairing/status` every few seconds — see `tv-app.tsx`).
    await page.bringToFront();
    await page.goto('/en/tv');
    // A brand-new page load mints a *different* pairing (see `TvApp`'s own
    // doc comment on why an unclaimed code is never persisted) — this just
    // confirms the kiosk page itself renders without needing a login, the
    // full pairing->claim->rotation transition is covered by `tv-app.test.tsx`.
    await expect(page.getByText('Pair this TV')).toBeVisible({ timeout: 20_000 });

    // Unpair from the admin side.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/tv`);
    await expect(page.getByText('Office lobby')).toBeVisible();
    await page.getByRole('button', { name: 'Unpair' }).click();
    await expect(page.getByText('No TVs are paired to this project yet.')).toBeVisible();
  });
});

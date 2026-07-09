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

test.describe('Project API keys: mint, copy-once, revoke (KAN-30)', () => {
  test('an org owner mints a scoped key, sees the raw secret exactly once, then revokes it', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signUp(page, uniqueEmail('keys-owner'));
    const orgId = await createOrganization(page, 'Keys E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));
    const projectId = new URL(page.url()).searchParams.get('project')!;

    await page.getByRole('link', { name: 'API keys' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/keys$`));
    await expect(page.getByText('No keys minted for this project yet.')).toBeVisible();

    await page.getByLabel('Name').fill('CI key');
    await page.getByLabel('Environment').selectOption({ label: 'Prod' });
    await page.getByRole('checkbox', { name: 'ingest.write' }).check();
    await page.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByText("Copy this key now — it won't be shown again.")).toBeVisible();
    // KAN-57 also renders the touchpoint-capture embed snippet alongside the
    // raw key (it embeds the same key inline), so the raw-key locator must be
    // scoped to `MintedApiKeyDisplay`'s own element, not any `<code>` block.
    const rawKeyLocator = page.getByTestId('minted-api-key-value');
    const rawKey = await rawKeyLocator.innerText();
    expect(rawKey).toMatch(/^gos_live_/);

    // KAN-57: minting a key with `ingest.write` also surfaces the touchpoint-capture
    // embed snippet, since the raw key it needs is only ever available right here.
    await expect(page.getByText('Website tracking snippet')).toBeVisible();
    await expect(page.locator('pre code')).toContainText(rawKey);
    await page.getByRole('button', { name: 'Copy snippet' }).click();
    const snippetClipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(snippetClipboardText).toContain(rawKey);
    expect(snippetClipboardText).toContain('window.growthos');

    // Scoped to `MintedApiKeyDisplay`'s own container: the touchpoint snippet's
    // copy button above was just clicked too, so an unscoped 'Copied' lookup
    // would now match two buttons.
    const mintedKeyDisplay = page.getByTestId('minted-api-key-display');
    await mintedKeyDisplay.getByRole('button', { name: 'Copy' }).click();
    await expect(mintedKeyDisplay.getByRole('button', { name: 'Copied' })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(rawKey);

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText("Copy this key now — it won't be shown again.")).not.toBeVisible();
    await expect(page.getByText('CI key')).toBeVisible();
    await expect(page.getByText('Never used')).toBeVisible();
    // The raw secret is never shown again after dismissal — only its safe prefix.
    await expect(page.getByText(rawKey, { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Revoked')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });
});

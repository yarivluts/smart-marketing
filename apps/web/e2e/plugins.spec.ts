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

const MANIFEST_YAML = `id: com.example.shopify-pack
version: 1.0.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]
config_schema:
  shop_domain: { type: string, required: true }
`;

test.describe('Plugins: register a manifest, install it into a project, disable/enable/uninstall (KAN-46)', () => {
  test('an org owner registers a manifest, installs it with scope consent, then disables/enables/uninstalls it', async ({ page }) => {
    // This spec drives a longer chain of actions (register -> install -> disable -> enable -> uninstall)
    // than most e2e specs in this suite; the default 30s test timeout is too tight under this sandbox's
    // documented dev-server/emulator contention (see PROGRESS.md), the same reasoning KAN-38's own
    // real-subprocess e2e assertion needed a raised `test.setTimeout` for.
    test.setTimeout(90_000);
    await signUp(page, uniqueEmail('plugins-owner'));
    const orgId = await createOrganization(page, 'Plugins E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Alpha');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}\\?project=`));

    await page.getByRole('link', { name: 'Plugin registry' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/plugins$`));

    await expect(page.getByText('No plugin manifests have been registered in this organization yet.')).toBeVisible();
    await page.getByLabel('plugin.yaml').fill(MANIFEST_YAML);
    await page.getByRole('button', { name: 'Register manifest' }).click();

    await expect(page.getByText('Shopify Commerce Pack')).toBeVisible();
    await expect(page.getByText('v1.0.0 · source')).toBeVisible();

    await page.goto(`/en/orgs/${orgId}`);
    await page.getByRole('link', { name: 'Plugins' }).click();
    await expect(page).toHaveURL(/\/en\/orgs\/[^/]+\/projects\/[^/]+\/plugins$/);

    await expect(page.getByText('No plugins have been installed in this project yet.')).toBeVisible();
    await page.getByLabel("I've reviewed and approve these scopes").check();
    await page.getByLabel(/shop_domain/).fill('my-shop.myshopify.com');
    await page.getByRole('button', { name: 'Install plugin' }).click();

    // Scoped to the installs list item specifically — the "Source runtime" section below repeats
    // the same "pluginId · version" line as its own per-install heading.
    await expect(page.getByRole('listitem').getByText('com.example.shopify-pack · v1.0.0')).toBeVisible();
    await expect(page.getByText('Installed', { exact: true })).toBeVisible();

    // KAN-47: the install is a `source`-type manifest, so a "Source runtime" section with a
    // run-now button + run history should now be visible for it.
    await expect(page.getByRole('heading', { name: 'Source runtime' })).toBeVisible();
    await expect(page.getByText('No sync runs yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByText(/Succeeded · started/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('3 fetched · 0 accepted · 3 quarantined · 0 duplicate')).toBeVisible();

    await page.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Enable' }).click();
    await expect(page.getByText('Installed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Uninstall' }).click();
    await expect(page.getByText('Uninstalled', { exact: true })).toBeVisible();
  });
});

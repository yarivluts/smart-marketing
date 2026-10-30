import { expect, test, type Page } from '@playwright/test';
import { openMoreTools } from './test-utils/nav';

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

test.describe('Campaign ops (KAN-86)', () => {
  test('an org owner reaches Campaign ops via nav, installs the payback pack, and sees every section degrade cleanly with no warehouse configured', async ({ page }) => {
    const email = uniqueEmail('campaign-ops-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Campaign Ops E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Delta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    await openMoreTools(page);
    await page.getByRole('link', { name: 'Ad payback' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/${projectId}/campaign-ops$`));
    await expect(page.getByRole('heading', { name: 'Ad payback: Client Delta' })).toBeVisible();

    // Spend targets don't need the pack installed at all — no warehouse configured in this environment.
    await expect(page.getByText('No spend data available yet — it will show here once your data is connected.')).toBeVisible();

    // Payback (and the per-campaign collection/ROI breakdown) needs the Campaign Ops pack installed.
    await expect(page.getByText('No payback data available yet — it will show here once your data is connected.')).not.toBeVisible();
    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('No payback data available yet — it will show here once your data is connected.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No per-ad payback data available yet — it will show here once your data is connected.')).toBeVisible();
  });

  test('renders /he/.../campaigns and campaign detail mobile-first at 390x844 with stacked cards and zero horizontal overflow', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });

    const email = uniqueEmail('campaigns-mobile-rtl');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Mobile Campaigns Org');

    await page.goto(`/en/orgs/${orgId}`);
    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Mobile Project');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];

    await page.goto(`/he/orgs/${orgId}/projects/${projectId}/campaigns`);
    await expect(page.getByTestId('ads-performance-dashboard')).toBeVisible();

    // Seed a campaign using the mobile AutomationSeedTargetForm right on the page.
    await page.locator('#seed-target-id').fill('camp-meta-1');
    await page.locator('#seed-target-label').fill('Meta Mobile Launch');
    await page.locator('#seed-target-budget').fill('120');
    await page.locator('#seed-target-id').locator('xpath=ancestor::form[1]').locator('button[type="submit"]').click();

    await expect(page.getByTestId('campaign-list-table')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Meta Mobile Launch' })).toBeVisible();

    // Verify no horizontal overflow on the 390px mobile screen in RTL.
    const campaignsScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(campaignsScrollWidth).toBeLessThanOrEqual(390);

    // Verify the campaign row renders as a stacked mobile flex card (< md) and budget presets stay LTR.
    const rowDisplay = await page.getByTestId('campaign-row-camp-meta-1').evaluate((el) => getComputedStyle(el).display);
    expect(rowDisplay).toBe('flex');

    const plusTenParentDir = await page
      .getByTestId('campaign-row-camp-meta-1')
      .getByRole('button', { name: '+10%' })
      .evaluate((el) => el.parentElement?.getAttribute('dir'));
    expect(plusTenParentDir).toBe('ltr');

    // Switch to Creatives & Analytics tabs on mobile and verify zero horizontal overflow.
    const tabs = page.locator('[data-testid="ads-performance-dashboard"] .border-b button');
    await tabs.nth(1).click();
    await expect(page.getByTestId('creative-preview-gallery')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await tabs.nth(2).click();
    await expect(page.getByTestId('executive-blended-report')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Navigate to Campaign Detail page on mobile and verify zero horizontal overflow and mobile FlowDiagram.
    await page.goto(`/he/orgs/${orgId}/projects/${projectId}/campaigns/camp-meta-1`);
    await expect(page.getByTestId('page-hero')).toBeVisible();
    await expect(page.getByTestId('flow-diagram')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Verify mobile-first layout (scrollWidth <= 390) across key project & org pages in RTL (/he).
    for (const subPath of [
      `/he/orgs/${orgId}/projects/${projectId}/growth-pilot`,
      `/he/orgs/${orgId}/projects/${projectId}/ad-studio`,
      `/he/orgs/${orgId}/projects/${projectId}/goals`,
      `/he/orgs/${orgId}/projects/${projectId}/automation`,
      `/he/orgs/${orgId}/projects/${projectId}/schema-defs`,
      `/he/orgs/${orgId}/projects/${projectId}/cost-guardrails`,
      `/he/orgs/${orgId}/projects/${projectId}/field-mappings`,
      `/he/orgs/${orgId}/projects/${projectId}/keys`,
      `/he/orgs/${orgId}/projects/${projectId}/segments`,
      `/he/orgs/${orgId}/projects/${projectId}/boards`,
      `/he/orgs/${orgId}/projects/${projectId}/cohorts`,
      `/he/orgs/${orgId}/projects/${projectId}/insights`,
      `/he/orgs/${orgId}/projects/${projectId}/customers`,
      `/he/orgs/${orgId}/projects/${projectId}/onboarding`,
      `/he/orgs/${orgId}/connections`,
      `/he/orgs/${orgId}/resources`,
      `/he/orgs/${orgId}/settings`,
    ]) {
      await page.goto(subPath);
      await expect(page.locator('main').first()).toBeVisible();
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `Expected ${subPath} scrollWidth (${sw}) <= 390`).toBeLessThanOrEqual(390);
    }
  });
});

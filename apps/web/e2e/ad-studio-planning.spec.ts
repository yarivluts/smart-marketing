import { expect, test, type Page } from '@playwright/test';
import { seedAdStudioPlan } from './test-utils/seed-ad-studio-plan';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/en/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Sup3rSecret!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

async function createBrief(page: Page): Promise<{ orgId: string; projectId: string; briefId: string }> {
  await signUp(page, uniqueEmail('ad-plan'));
  await page.goto('/en/orgs/new');
  await page.getByLabel('Organization name').fill('Ad Planning E2E Org');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name: 'Ad Planning E2E Org' })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split('/').pop() as string;

  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Law Firm Studio');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
  const projectId = new URL(page.url()).pathname.split('/').slice(-2)[0];

  await page.goto(`/en/orgs/${orgId}/projects/${projectId}/ad-studio`);
  await page.getByLabel('Ad name').fill('Sign in 30 seconds');
  await page.getByLabel('What should the ad achieve?').fill('Trial signups from small law firms');
  await page.getByLabel('What is being sold, and to whom?').fill('E-signatures for lawyers');
  await page.getByLabel('Landing page (optional)').fill('https://example.com/lawyers');
  await page.getByRole('button', { name: 'Create ad' }).click();
  await expect(page).toHaveURL(/\?brief=/);
  const briefId = new URL(page.url()).searchParams.get('brief') as string;
  return { orgId, projectId, briefId };
}

test.describe('AI Ad Studio deep analysis (KAN-230)', () => {
  test('a new brief offers deep analysis and the settings say why keyword volumes are missing; a stored plan renders its sources, charts and cited recommendations', async ({ page }) => {
    test.setTimeout(120_000);
    const { orgId, projectId, briefId } = await createBrief(page);

    const panel = page.getByTestId('ad-studio-planning');
    await expect(panel.getByRole('heading', { name: 'Deep analysis' })).toBeVisible();
    await expect(panel.getByText('No analysis yet')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Run deep analysis' })).toBeVisible();
    await expect(page.getByTestId('ad-studio-keyword-data')).toContainText('No Google Ads credential is attached to this project.');

    // Stand in for a model call: store a plan through the same service the plan route writes with.
    await seedAdStudioPlan({ organizationId: orgId, projectId, briefId });
    await page.reload();

    const sources = page.getByTestId('ad-studio-plan-sources');
    await expect(sources.locator('[data-status="ok"]')).toHaveCount(4);
    await expect(sources.locator('[data-source="market"]')).toContainText('General knowledge from the AI model. Not measured.');
    await expect(page.getByText('Visitors per landing page')).toBeVisible();
    await expect(page.getByText('example.com/lawyers').first()).toBeVisible();
    await expect(page.getByText('Keyword ideas by monthly searches')).toBeVisible();
    await expect(page.getByText('12,100', { exact: true })).toBeVisible();
    const recommendations = page.getByTestId('ad-studio-recommendation');
    await expect(recommendations).toHaveCount(3);
    await expect(recommendations.first()).toContainText('High priority');
    await expect(page.getByTestId('ad-studio-market-notes')).toContainText('General model knowledge, not measured data.');
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible();
  });
});

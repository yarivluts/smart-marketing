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

test.describe('Funnel, Goals & Revenue Health cockpit', () => {
  test('an org owner reaches the cockpit via nav and it renders for a fresh project', async ({ page }) => {
    const email = uniqueEmail('funnel-owner');
    await signUp(page, email);
    const orgId = await createOrganization(page, 'Funnel E2E Org');

    await page.getByRole('link', { name: 'New project' }).click();
    await page.getByLabel('Project name').fill('Client Theta');
    await page.getByRole('button', { name: 'Create project' }).click();
    // Creating a project lands on the onboarding wizard (KAN-68) rather than the org page.
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}/projects/[^/]+/onboarding$`));
    const projectId = page.url().split('/').slice(-2)[0];
    await page.goto(`/en/orgs/${orgId}?project=${projectId}`);

    // The 3-module nav redesign (`bd7d215`) both dropped the sidebar link to this page (still
    // navigable directly) and replaced its content: the old standalone "Conversion" funnel page
    // was absorbed into a unified Funnel/Goals/Cohorts/Payback/Quality cockpit
    // (`funnel-goals-dashboard.tsx`), so the old page-name heading and "no funnel confirmed" copy
    // no longer exist. The new `buildFunnelGoalsCockpitData` synthesizer also doesn't degrade to
    // an honest empty state for a project with no real data the way the boards/campaign-ops tiles
    // do elsewhere in this app — it renders plausible-looking demo numbers (KPI cards, a synthetic
    // "Conversion Funnel: Client Theta" with fabricated volumes) regardless — a real product
    // question for the redesign's own owner, out of scope for this nav-fix PR. Assert only the
    // stable heading/description text, not any of the synthesized figures.
    await page.goto(`/en/orgs/${orgId}/projects/${projectId}/funnel`);
    await expect(page.getByRole('heading', { name: 'Funnel, Goals & Revenue Health' })).toBeVisible();
    await expect(
      page.getByText('Visual conversion pipelines, dynamic business goals tracking, and cohort retention health.'),
    ).toBeVisible();
  });
});

import { expect, type Page } from '@playwright/test';

/**
 * Opens where every tool beyond the essentials lives, so a spec can click one of its links: the
 * project sidebar's "More tools" group, and on the org page the project card's "All tools" list.
 * Does nothing where neither exists or when they are already open (they stay open for the rest of the
 * test once opened). A click that lands before the page has hydrated does nothing, so it clicks again
 * until the group reports itself open.
 */
export async function openMoreTools(page: Page): Promise<void> {
  const allTools = page.getByTestId('project-all-tools');
  if ((await allTools.count()) > 0 && !(await allTools.first().evaluate((details) => (details as HTMLDetailsElement).open))) {
    await allTools.first().locator('summary').click();
  }
  const toggle = page.getByTestId('nav-group-more');
  if ((await toggle.count()) === 0) return;
  const first = toggle.first();
  await expect(async () => {
    if ((await first.getAttribute('aria-expanded')) !== 'true') await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

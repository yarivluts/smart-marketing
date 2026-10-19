import { expect, type Page } from '@playwright/test';

/**
 * Opens the project sidebar's "More tools" group, where every tool beyond the essentials lives, so a
 * spec can click one of its links. Does nothing on pages without the group (org pages) or when it is
 * already open (it stays open for the rest of the test once opened). A click that lands before the
 * page has hydrated does nothing, so it clicks again until the group reports itself open.
 */
export async function openMoreTools(page: Page): Promise<void> {
  const toggle = page.getByTestId('nav-group-more');
  if ((await toggle.count()) === 0) return;
  const first = toggle.first();
  await expect(async () => {
    if ((await first.getAttribute('aria-expanded')) !== 'true') await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

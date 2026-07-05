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
  // Next dev-mode compiles each route on its first hit — the very first
  // navigation to a fresh `/orgs/[orgId]` route in a test run can take
  // longer than the default assertion timeout purely from that one-time
  // compile, not from anything actually being slow at runtime.
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
  return page.url().split('/').pop()!;
}

test.describe('Org-scoped sessions: create + switch + invite/join (KAN-25)', () => {
  test('a user with two org memberships switches contexts via the org switcher', async ({ page }) => {
    await signUp(page, uniqueEmail('owner'));

    await createOrganization(page, 'Acme E2E');
    await createOrganization(page, 'Beta E2E');

    // Both orgs must be listed — the switcher lists only this user's memberships.
    await page.getByLabel('Organization').selectOption({ label: 'Acme E2E' });
    await expect(page).toHaveURL(/\/en\/orgs\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Acme E2E' })).toBeVisible();

    await page.goto('/en/orgs');
    await expect(page.getByText('Acme E2E')).toBeVisible();
    await expect(page.getByText('Beta E2E')).toBeVisible();
  });

  test('invites someone by email; they see and can accept it after signing up with a matching email', async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail('inviter');
    await signUp(page, ownerEmail);
    const orgId = await createOrganization(page, 'Invite E2E Org');

    const inviteeEmail = uniqueEmail('invitee');
    await page.getByLabel('Email').fill(inviteeEmail);
    await page.getByLabel('Role').selectOption('viewer');
    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByText(inviteeEmail)).toBeVisible();

    await page.goto('/en/dashboard');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en\/login/);

    await signUp(page, inviteeEmail);

    await page.goto('/en/orgs');
    await expect(page.getByText('Pending invites')).toBeVisible();
    await expect(page.getByText('Invite E2E Org')).toBeVisible();
    await page.getByRole('link', { name: 'View invite' }).click();

    await expect(page).toHaveURL(new RegExp(`/en/invite/${orgId}/`));
    await page.getByRole('button', { name: 'Accept invite' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/orgs/${orgId}$`));
    await expect(page.getByRole('heading', { name: 'Invite E2E Org' })).toBeVisible();

    // Accepted as `viewer`, which doesn't hold `members.manage` — the invite
    // form must not render for them (server-side permission check, not just
    // a hidden button: the org page itself omits it).
    await expect(page.getByLabel('Email')).not.toBeVisible();
  });
});

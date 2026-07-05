import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { UserOrgMembership } from '@growthos/firebase-orm-models';
import { OrgSwitcher } from './org-switcher';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

const memberships: UserOrgMembership[] = [
  { membershipId: 'm1', organizationId: 'org-1', organizationName: 'Acme', role: 'org_owner', status: 'active' },
  { membershipId: 'm2', organizationId: 'org-2', organizationName: 'Globex', role: 'viewer', status: 'active' },
  { membershipId: 'm3', organizationId: 'org-3', organizationName: 'Pending Co', role: 'viewer', status: 'invited' },
];

function renderSwitcher(currentOrgId = 'org-1'): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgSwitcher memberships={memberships} currentOrgId={currentOrgId} />
    </NextIntlClientProvider>,
  );
}

describe('OrgSwitcher', () => {
  it('lists only active memberships, never a pending invite', () => {
    renderSwitcher();
    expect(screen.getByRole('option', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Globex' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pending Co' })).not.toBeInTheDocument();
  });

  it('navigates to the newly selected org on change', () => {
    renderSwitcher();
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-2' } });
    expect(push).toHaveBeenCalledWith('/orgs/org-2');
  });
});

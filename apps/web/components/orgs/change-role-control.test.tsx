import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ChangeRoleControl } from './change-role-control';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderControl(role: 'org_admin' | 'viewer' = 'org_admin'): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChangeRoleControl orgId="org-1" membershipId="m1" role={role} />
    </NextIntlClientProvider>,
  );
}

describe('ChangeRoleControl', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the member current role as the selected option', () => {
    renderControl('org_admin');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('org_admin');
  });

  it('changes the role and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ role: 'viewer' }) } as Response);
    renderControl('org_admin');

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'viewer' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/members/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'viewer' }),
    });
  });

  it('reverts and shows an error when the change fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'role_not_changeable' }) } as Response);
    renderControl('org_admin');

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'viewer' } });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change this member's role. Please try again.");
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('org_admin'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

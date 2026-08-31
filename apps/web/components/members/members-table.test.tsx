import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { MembersTable } from './members-table';
import { ChangeRoleControl } from './change-role-control';
import enMessages from '@/messages/en.json';

const mockRouterRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

describe('Member Management Components (Milestone 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders MembersTable with members list, avatars, and status pills', () => {
    renderWithIntl(<MembersTable orgId="org-1" />);

    expect(screen.getByTestId('members-table-container')).toBeInTheDocument();
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('alex.mercer@growthos.io')).toBeInTheDocument();
    expect(screen.getByTestId('member-status-mem-1')).toHaveTextContent('active');
  });

  it('filters member table by search query input', () => {
    renderWithIntl(<MembersTable orgId="org-1" />);

    const searchInput = screen.getByTestId('search-members-input');
    fireEvent.change(searchInput, { target: { value: 'Alex' } });

    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
  });

  it('handles in-place role selection and submits PATCH request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(<ChangeRoleControl orgId="org-1" membershipId="mem-123" role="viewer" />);

    const select = screen.getByLabelText(enMessages.Members.changeRoleLabel);
    expect(select).toHaveValue('viewer');

    fireEvent.change(select, { target: { value: 'editor' } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/members/mem-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'editor' }),
        }),
      );
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  it('opens InviteMemberModal, handles email input, and submits invite', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(<MembersTable orgId="org-1" />);

    fireEvent.click(screen.getByTestId('open-invite-modal-btn'));
    expect(screen.getByTestId('invite-member-modal')).toBeInTheDocument();

    const emailInput = screen.getByTestId('modal-invite-email-input');
    fireEvent.change(emailInput, { target: { value: 'newmember@growthos.io' } });

    fireEvent.click(screen.getByTestId('modal-submit-invite-btn'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'newmember@growthos.io', role: 'viewer' }),
        }),
      );
      expect(screen.queryByTestId('invite-member-modal')).not.toBeInTheDocument();
    });
  });

  it('handles member suspension and deletion actions', () => {
    const handleRemove = vi.fn();
    renderWithIntl(<MembersTable orgId="org-1" onRemoveMember={handleRemove} />);

    const removeBtn = screen.getByTestId('remove-btn-mem-1');
    fireEvent.click(removeBtn);

    expect(handleRemove).toHaveBeenCalledWith('mem-1');
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument();
  });
});

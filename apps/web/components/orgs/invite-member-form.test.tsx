import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InviteMemberForm } from './invite-member-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InviteMemberForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('InviteMemberForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the email and selected role, then refreshes the member list', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ membershipId: 'm1' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/invites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com', role: 'editor' }),
      }),
    );
  });

  it('shows an inline error when the invite fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send that invite. They may already be a member.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

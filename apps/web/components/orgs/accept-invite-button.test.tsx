import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AcceptInviteButton } from './accept-invite-button';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AcceptInviteButton orgId="org-1" membershipId="m1" />
    </NextIntlClientProvider>,
  );
}

describe('AcceptInviteButton', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('accepts the invite and navigates to the org', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1'));
    expect(fetch).toHaveBeenCalledWith('/api/invites/org-1/m1/accept', { method: 'POST' });
  });

  it('shows an inline error when acceptance fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'already_resolved' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't accept this invite. Please try again.");
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a verify-your-email message when the account has not confirmed its email yet', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'email_not_verified' }),
    } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verify your email address before accepting this invite. Check your inbox for the verification link.',
    );
    expect(push).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SuspendMemberButton } from './suspend-member-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SuspendMemberButton orgId="org-1" membershipId="m1" />
    </NextIntlClientProvider>,
  );
}

describe('SuspendMemberButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('suspends the member and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'suspended' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/members/m1/suspend', { method: 'POST' });
  });

  it('shows a generic error when suspension fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'not_active' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't suspend this member. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the last-owner message when suspension is blocked for that reason', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'last_owner' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An organization must always have at least one owner.');
  });
});

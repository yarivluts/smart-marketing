import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactivateMemberButton } from './reactivate-member-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReactivateMemberButton orgId="org-1" membershipId="m1" />
    </NextIntlClientProvider>,
  );
}

describe('ReactivateMemberButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('reactivates the member and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'active' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/members/m1/reactivate', { method: 'POST' });
  });

  it('shows a generic error when reactivation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'not_suspended' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Nothing was changed; the member is still suspended. Check your internet connection and try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('says nothing was changed when the connection drops', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Check your internet connection');
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

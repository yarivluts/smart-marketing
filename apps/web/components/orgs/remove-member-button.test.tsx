import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RemoveMemberButton } from './remove-member-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RemoveMemberButton orgId="org-1" membershipId="m1" />
    </NextIntlClientProvider>,
  );
}

describe('RemoveMemberButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('removes the member and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/members/m1', { method: 'DELETE' });
  });

  it('shows a generic error when removal fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'not_found' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't remove this member. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the last-owner message when removal is blocked for that reason', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'last_owner' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An organization must always have at least one owner.');
  });
});

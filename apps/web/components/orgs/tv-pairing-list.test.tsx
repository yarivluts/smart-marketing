import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TvPairingList } from './tv-pairing-list';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const BOARDS = [{ id: 'board-1', name: 'Marketing', tileCount: 2, updatedAt: '2026-07-01T00:00:00.000Z' }];

function renderList(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TvPairingList
        orgId="org-1"
        projectId="project-1"
        boards={BOARDS}
        pairings={[
          { id: 'pairing-1', label: 'Office lobby', boardIds: ['board-1'], rotationSeconds: 30, reducedMotion: false, claimedAt: '2026-07-01T00:00:00.000Z', lastSeenAt: '2026-07-12T00:00:00.000Z' },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

describe('TvPairingList', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the board name (not the raw id) and the last-seen time', () => {
    renderList();
    expect(screen.getByText('Office lobby')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
  });

  it('DELETEs the pairing and refreshes on unpair', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'revoked' }) } as Response);
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/tv-pairing/pairing-1', { method: 'DELETE' });
  });

  it('shows an inline error when unpairing fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not unpair this TV. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

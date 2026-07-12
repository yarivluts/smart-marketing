import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ClaimTvPairingForm } from './claim-tv-pairing-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const BOARDS = [
  { id: 'board-1', name: 'Marketing', tileCount: 3, updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'board-2', name: 'Revenue', tileCount: 5, updatedAt: '2026-07-01T00:00:00.000Z' },
];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ClaimTvPairingForm orgId="org-1" projectId="project-1" boards={BOARDS} />
    </NextIntlClientProvider>,
  );
}

describe('ClaimTvPairingForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('disables submit until a code, label, and at least one board are set', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Pair TV' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'ab12cd' } });
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'Office lobby' } });
    expect(screen.getByRole('button', { name: 'Pair TV' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Marketing'));
    expect(screen.getByRole('button', { name: 'Pair TV' })).toBeEnabled();
  });

  it('claims a pairing, uppercasing the code, and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ pairing: { id: 'pairing-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'ab12cd' } });
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'Office lobby' } });
    fireEvent.click(screen.getByLabelText('Marketing'));
    fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/tv-pairing',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'AB12CD', boardIds: ['board-1'], rotationSeconds: 30, reducedMotion: false, label: 'Office lobby' }),
      }),
    );
  });

  it('supports selecting multiple boards and toggling reduced motion', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ pairing: { id: 'pairing-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'ZZ9999' } });
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'War room' } });
    fireEvent.click(screen.getByLabelText('Marketing'));
    fireEvent.click(screen.getByLabelText('Revenue'));
    fireEvent.click(screen.getByLabelText('Reduced motion (disable confetti)'));
    fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/tv-pairing',
      expect.objectContaining({
        body: JSON.stringify({ code: 'ZZ9999', boardIds: ['board-1', 'board-2'], rotationSeconds: 30, reducedMotion: true, label: 'War room' }),
      }),
    );
  });

  it('shows an inline error when claiming fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'AB12CD' } });
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'Office lobby' } });
    fireEvent.click(screen.getByLabelText('Marketing'));
    fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not pair this TV. Check the code and try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditTvPairingSettingsForm } from './edit-tv-pairing-settings-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const BOARDS = [
  { id: 'board-1', name: 'Marketing', tileCount: 2, updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'board-2', name: 'Sales', tileCount: 1, updatedAt: '2026-07-01T00:00:00.000Z' },
];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditTvPairingSettingsForm
        orgId="org-1"
        projectId="project-1"
        pairingId="pairing-1"
        initialLabel="Office lobby"
        initialBoardIds={['board-1']}
        initialRotationSeconds={30}
        initialReducedMotion={false}
        boards={BOARDS}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditTvPairingSettingsForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('TV label')).not.toBeInTheDocument();
  });

  it('reveals every field pre-filled from the current settings', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('TV label')).toHaveValue('Office lobby');
    expect(screen.getByLabelText('Seconds per frame')).toHaveValue(30);
    expect(screen.getByRole('checkbox', { name: 'Marketing' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sales' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Reduced motion (disable confetti)' })).not.toBeChecked();
  });

  it('submits the edited settings via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ pairing: { id: 'pairing-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'Updated lobby' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sales' }));
    fireEvent.change(screen.getByLabelText('Seconds per frame'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduced motion (disable confetti)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/tv-pairing/pairing-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ label: 'Updated lobby', boardIds: ['board-1', 'board-2'], rotationSeconds: 45, reducedMotion: true }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('disables saving once every board is unchecked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marketing' }));

    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save these settings. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('TV label')).toBeInTheDocument();
  });

  it('cancels back to the Edit button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('TV label'), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('TV label')).toHaveValue('Office lobby');
  });
});

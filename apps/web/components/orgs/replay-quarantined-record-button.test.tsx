import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReplayQuarantinedRecordButton } from './replay-quarantined-record-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReplayQuarantinedRecordButton orgId="org-1" projectId="project-1" quarantinedRecordId="qr-1" />
    </NextIntlClientProvider>,
  );
}

describe('ReplayQuarantinedRecordButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the replay request and refreshes when the record is accepted', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ outcome: 'accepted' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/quarantined-records/qr-1/replay', {
      method: 'POST',
    });
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
  });

  it('shows the refreshed reasons and does not refresh when replay still fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: 'still_quarantined', reasons: ['missing_required_field:plan'] }),
    } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Still rejected: missing_required_field:plan')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't try this record again. Please try again in a moment.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

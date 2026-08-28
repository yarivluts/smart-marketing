import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DismissQuarantinedRecordButton } from './dismiss-quarantined-record-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DismissQuarantinedRecordButton orgId="org-1" projectId="project-1" quarantinedRecordId="qr-1" />
    </NextIntlClientProvider>,
  );
}

describe('DismissQuarantinedRecordButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('does nothing when the confirm dialog is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('POSTs the dismiss request and refreshes once confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ outcome: 'dismissed' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/quarantined-records/qr-1/dismiss', {
      method: 'POST',
    });
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't dismiss this record. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

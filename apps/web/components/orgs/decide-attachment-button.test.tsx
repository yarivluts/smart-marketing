import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DecideAttachmentButton } from './decide-attachment-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(approve: boolean): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DecideAttachmentButton orgId="org-1" attachmentId="attach-1" approve={approve} />
    </NextIntlClientProvider>,
  );
}

describe('DecideAttachmentButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('PATCHes approve=true and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'approved' }) } as Response);
    renderButton(true);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resource-attachments/attach-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ approve: true }) }),
    );
  });

  it('PATCHes approve=false for the reject button', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'rejected' }) } as Response);
    renderButton(false);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resource-attachments/attach-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ approve: false }) }),
    );
  });

  it('shows an inline error when the decision fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton(true);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't record that decision. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

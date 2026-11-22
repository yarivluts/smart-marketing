import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DetachAttachmentButton } from './detach-attachment-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DetachAttachmentButton orgId="org-1" attachmentId="attach-1" />
    </NextIntlClientProvider>,
  );
}

describe('DetachAttachmentButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the attachment and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'detached' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from this project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/resource-attachments/attach-1', { method: 'DELETE' });
  });

  it('shows an inline error when detaching fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from this project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't remove this from the project. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('asks first, sends nothing until confirmed, and Keep it backs out', () => {
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from this project' }));
    expect(screen.getByText(/GrowthOS stops using it here/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Remove from this project' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

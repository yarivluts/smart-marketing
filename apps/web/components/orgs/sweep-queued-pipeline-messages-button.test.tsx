import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SweepQueuedPipelineMessagesButton } from './sweep-queued-pipeline-messages-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SweepQueuedPipelineMessagesButton orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('SweepQueuedPipelineMessagesButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the sweep request, shows the outcome, and refreshes when something was delivered', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ delivered: 2, failed: 1 }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Sweep stuck queued messages' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/ingest-health/sweep-queued-pipeline-messages', {
      method: 'POST',
    });
    expect(await screen.findByText('2 delivered, 1 still failing')).toBeInTheDocument();
  });

  it('does not refresh when nothing was delivered', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ delivered: 0, failed: 0 }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Sweep stuck queued messages' }));

    expect(await screen.findByText('0 delivered, 0 still failing')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Sweep stuck queued messages' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sweep queued messages. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

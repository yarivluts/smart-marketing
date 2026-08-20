import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrainPipelineMessagesButton } from './drain-pipeline-messages-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const ENVIRONMENTS = [
  { id: 'env-dev', name: 'dev' as const },
  { id: 'env-prod', name: 'prod' as const },
];

function renderButton(environments = ENVIRONMENTS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DrainPipelineMessagesButton orgId="org-1" projectId="project-1" environments={environments} />
    </NextIntlClientProvider>,
  );
}

describe('DrainPipelineMessagesButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the drain request for the selected environment, shows the outcome, and refreshes when something was delivered', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ delivered: 2, failed: 0 }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Drain queued messages' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/ingest-health/drain-pipeline-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environmentId: 'env-dev' }),
    });
    expect(await screen.findByText('2 delivered, 0 failed')).toBeInTheDocument();
  });

  it('POSTs the newly selected environment after the user changes it, and does not refresh when nothing was delivered', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ delivered: 0, failed: 0 }) } as Response);
    renderButton();

    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drain queued messages' }));

    expect(await screen.findByText('0 delivered, 0 failed')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/ingest-health/drain-pipeline-messages',
      expect.objectContaining({ body: JSON.stringify({ environmentId: 'env-prod' }) }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Drain queued messages' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't drain queued pipeline messages. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a fallback message and no button when the project has no environments', () => {
    renderButton([]);
    expect(screen.getByText('No environments yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drain queued messages' })).not.toBeInTheDocument();
  });
});

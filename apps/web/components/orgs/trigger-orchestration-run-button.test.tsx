import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TriggerOrchestrationRunButton } from './trigger-orchestration-run-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TriggerOrchestrationRunButton orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('TriggerOrchestrationRunButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the trigger request and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: 'run-1', status: 'succeeded', errorMessage: null }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/ingest-health/trigger-orchestration-run', {
      method: 'POST',
    });
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't trigger an orchestration run. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

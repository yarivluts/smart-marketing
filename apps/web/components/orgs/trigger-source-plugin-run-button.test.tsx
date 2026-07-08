import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TriggerSourcePluginRunButton } from './trigger-source-plugin-run-button';
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
      <TriggerSourcePluginRunButton orgId="org-1" projectId="project-1" installId="install-1" environments={environments} />
    </NextIntlClientProvider>,
  );
}

describe('TriggerSourcePluginRunButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the trigger request for the selected environment and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ run: { status: 'succeeded' } }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins/install-1/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environmentId: 'env-dev' }),
    });
  });

  it('POSTs the newly selected environment after the user changes it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ run: { status: 'succeeded' } }) } as Response);
    renderButton();

    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/plugins/install-1/run',
      expect.objectContaining({ body: JSON.stringify({ environmentId: 'env-prod' }) }),
    );
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't trigger a sync run. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a fallback message and no button when the project has no environments', () => {
    renderButton([]);
    expect(screen.getByText('No environments exist for this project yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();
  });
});

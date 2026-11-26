import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DisableHookEndpointButton } from './disable-hook-endpoint-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DisableHookEndpointButton orgId="org-1" projectId="project-1" hookEndpointId="endpoint-1" />
    </NextIntlClientProvider>,
  );
}

describe('DisableHookEndpointButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the endpoint and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'disabled' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hook-endpoints/endpoint-1', { method: 'DELETE' });
  });

  it('shows an inline error when disabling fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("The data link was not turned off and still receives data. Check your internet connection and try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explains nothing changed when the connection drops', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The data link was not turned off and still receives data. Check your internet connection and try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

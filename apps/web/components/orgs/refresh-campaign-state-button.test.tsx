import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RefreshCampaignStateButton } from './refresh-campaign-state-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RefreshCampaignStateButton orgId="org-1" projectId="project-1" targetId="t/1" />
    </NextIntlClientProvider>,
  );
}

describe('RefreshCampaignStateButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the refresh and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/automation/targets/t%2F1/refresh', { method: 'POST' });
  });

  it('says nothing was changed when the server refuses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was changed/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a message and re-enables the button when the connection drops', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/internet connection/);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});

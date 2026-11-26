import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import { PauseCampaignButton } from './pause-campaign-button';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PauseCampaignButton orgId="o1" projectId="p1" activationActionId="a1" />
    </NextIntlClientProvider>,
  );
}

describe('PauseCampaignButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('refreshes after a successful pause', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Pause ad' }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the ad is still running when the server refuses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Pause ad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The ad was not paused and is still running. Check your internet connection');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the same message when the connection drops and allows retry', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Pause ad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still running');
    expect(screen.getByRole('button', { name: 'Pause ad' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

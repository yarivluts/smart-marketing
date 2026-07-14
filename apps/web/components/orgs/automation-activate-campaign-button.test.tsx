import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationActivateCampaignButton } from './automation-activate-campaign-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationActivateCampaignButton orgId="org-1" projectId="project-1" targetId="target-1" />
    </NextIntlClientProvider>,
  );
}

describe('AutomationActivateCampaignButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('proposes an activation and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Propose activation' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/automation/actions/campaign-activations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetId: 'target-1' }),
      }),
    );
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Propose activation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the activation. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

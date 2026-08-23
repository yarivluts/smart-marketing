import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CheckFirmographicCompositionAlertsButton } from './check-firmographic-composition-alerts-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckFirmographicCompositionAlertsButton orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('CheckFirmographicCompositionAlertsButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the check request and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true, checkedAt: '2026-07-08T12:00:00.000Z', industries: [] }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/firmographics/check-composition-alerts', {
      method: 'POST',
    });
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

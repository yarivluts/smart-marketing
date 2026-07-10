import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { HookDeliveryStatusButtons } from './hook-delivery-status-buttons';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButtons(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HookDeliveryStatusButtons orgId="org-1" projectId="project-1" hookDeliveryId="delivery-1" />
    </NextIntlClientProvider>,
  );
}

describe('HookDeliveryStatusButtons', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('PATCHes status=reviewed and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'reviewed' }) } as Response);
    renderButtons();

    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hook-deliveries/delivery-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'reviewed' }),
    });
  });

  it('PATCHes status=discarded and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'discarded' }) } as Response);
    renderButtons();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hook-deliveries/delivery-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'discarded' }),
    });
  });

  it('shows an inline error when the update fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButtons();

    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update this delivery. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

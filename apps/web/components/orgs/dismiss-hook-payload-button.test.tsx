import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DismissHookPayloadButton } from './dismiss-hook-payload-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DismissHookPayloadButton orgId="org-1" projectId="project-1" hookPayloadId="payload-1" />
    </NextIntlClientProvider>,
  );
}

describe('DismissHookPayloadButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the dismiss request and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'dismissed' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hook-payloads/payload-1/dismiss', {
      method: 'POST',
    });
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't dismiss this payload. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

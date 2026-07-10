import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RevokeHookEndpointButton } from './revoke-hook-endpoint-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RevokeHookEndpointButton orgId="org-1" projectId="project-1" hookEndpointId="hook-1" />
    </NextIntlClientProvider>,
  );
}

describe('RevokeHookEndpointButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the hook endpoint and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'revoked' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hooks/hook-1', { method: 'DELETE' });
  });

  it('shows an inline error when revoking fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't revoke this hook endpoint. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

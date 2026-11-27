import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RevokeMcpConnectionButton } from './revoke-mcp-connection-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RevokeMcpConnectionButton orgId="org-1" projectId="project-1" grantId="grant-1" />
    </NextIntlClientProvider>,
  );
}

describe('RevokeMcpConnectionButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the connection and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'revoked' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/mcp-grants/grant-1', { method: 'DELETE' });
  });

  it('shows an inline error when revoking fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("The connection was not revoked and still works. Check your internet connection and try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the same message when the connection drops', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still works');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ArchiveProjectButton } from './archive-project-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(archived: boolean): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ArchiveProjectButton orgId="org-1" projectId="project-1" archived={archived} />
    </NextIntlClientProvider>,
  );
}

describe('ArchiveProjectButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('confirms before archiving a live project, then POSTs archived=true and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton(false);

    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
  });

  it('unarchives without a confirmation prompt', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton(true);

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive project' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ archived: false }) });
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton(false);

    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Could not change the project's archive state. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

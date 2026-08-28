import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArchiveToggleButton } from './archive-toggle-button';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const baseProps = {
  archivePath: '/api/orgs/org-1/resources/people/person-1',
  unarchivePath: '/api/orgs/org-1/resources/people/person-1/unarchive',
  archiveLabel: 'Archive',
  unarchiveLabel: 'Restore',
  errorLabel: "Couldn't do that. Please try again.",
};

describe('ArchiveToggleButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the archive path and refreshes when active', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'archived' }) } as Response);
    render(<ArchiveToggleButton {...baseProps} archived={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/resources/people/person-1', { method: 'DELETE' });
  });

  it('POSTs the unarchive path and refreshes when archived', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'active' }) } as Response);
    render(<ArchiveToggleButton {...baseProps} archived={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/resources/people/person-1/unarchive', { method: 'POST' });
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(<ArchiveToggleButton {...baseProps} archived={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't do that. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

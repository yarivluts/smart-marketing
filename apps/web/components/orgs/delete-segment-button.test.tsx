import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DeleteSegmentButton } from './delete-segment-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeleteSegmentButton orgId="org-1" projectId="project-1" segmentId="segment-1" />
    </NextIntlClientProvider>,
  );
}

describe('DeleteSegmentButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('does nothing when the confirm dialog is dismissed', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('deletes the segment and refreshes the list when confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/segments/segment-1', { method: 'DELETE' });
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the segment. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

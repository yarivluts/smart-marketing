import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentWorkListControls } from './segment-work-list-controls';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const people = [
  { id: 'person-1', name: 'Alex Rep' },
  { id: 'person-2', name: 'Sam Rep' },
];

function renderControls(overrides: Partial<{ ownerPersonId: string | null; status: 'open' | 'in_progress' | 'done' }> = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentWorkListControls
        orgId="org-1"
        projectId="project-1"
        segmentId="segment-1"
        ownerPersonId={overrides.ownerPersonId ?? null}
        status={overrides.status ?? 'open'}
        people={people}
      />
    </NextIntlClientProvider>,
  );
}

describe('SegmentWorkListControls', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the unassigned owner option and every person', () => {
    renderControls();
    expect(screen.getByLabelText('Owner')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alex Rep' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sam Rep' })).toBeInTheDocument();
  });

  it('PATCHes ownerPersonId when a different owner is picked, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'person-2' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ownerPersonId: 'person-2' }) }),
    );
  });

  it('PATCHes ownerPersonId: null when set back to unassigned', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls({ ownerPersonId: 'person-1' });

    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: '' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ownerPersonId: null }) }),
    );
  });

  it('PATCHes status when a different status is picked, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'done' }) }),
    );
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the segment. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

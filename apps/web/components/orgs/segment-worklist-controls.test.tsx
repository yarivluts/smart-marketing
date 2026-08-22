import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentWorklistControls } from './segment-worklist-controls';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const people = [
  { id: 'person-1', name: 'Alex Rep' },
  { id: 'person-2', name: 'Sam Rep' },
];

function renderControls(overrides: Partial<{ status: 'new' | 'in_progress' | 'done' | 'dismissed'; ownerPersonId: string | null }> = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentWorklistControls
        orgId="org-1"
        projectId="project-1"
        segmentId="segment-1"
        status={overrides.status ?? 'new'}
        ownerPersonId={overrides.ownerPersonId ?? null}
        people={people}
      />
    </NextIntlClientProvider>,
  );
}

describe('SegmentWorklistControls', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the unassigned owner option and every person', () => {
    renderControls();
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alex Rep' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sam Rep' })).toBeInTheDocument();
  });

  it('PATCHes an owner assignment and refreshes on change', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'person-1' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/segments/segment-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerPersonId: 'person-1' }),
    });
  });

  it('PATCHes null to clear the owner when the unassigned option is chosen', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls({ ownerPersonId: 'person-1' });

    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: '' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ body: JSON.stringify({ ownerPersonId: null }) }),
    );
  });

  it('PATCHes a status change and refreshes on change', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ body: JSON.stringify({ status: 'in_progress' }) }),
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RepCollectionEntryControls } from './rep-collection-entry-controls';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const people = [
  { id: 'person-1', name: 'Alex Rep' },
  { id: 'person-2', name: 'Sam Rep' },
];

function renderControls(overrides: Partial<{ orgPersonId: string | null; amount: number }> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RepCollectionEntryControls
        orgId="org-1"
        projectId="project-1"
        entryId="entry-1"
        orgPersonId={overrides.orgPersonId ?? null}
        amount={overrides.amount ?? 500}
        people={people}
      />
    </NextIntlClientProvider>,
  );
}

describe('RepCollectionEntryControls', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('renders the unassigned rep option, every person, and the current amount', () => {
    renderControls();
    expect(screen.getByLabelText('Rep')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alex Rep' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue(500);
  });

  it('PATCHes orgPersonId when a different rep is picked, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Rep'), { target: { value: 'person-2' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/entry-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ orgPersonId: 'person-2' }) }),
    );
  });

  it('PATCHes orgPersonId: null when set back to unassigned', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls({ orgPersonId: 'person-1' });

    fireEvent.change(screen.getByLabelText('Rep'), { target: { value: '' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/entry-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ orgPersonId: null }) }),
    );
  });

  it('PATCHes the new amount on blur, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '750' } });
    fireEvent.blur(screen.getByLabelText('Amount'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/entry-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ amount: 750 }) }),
    );
  });

  it('does not PATCH on blur when the amount is unchanged', () => {
    renderControls({ amount: 500 });

    fireEvent.blur(screen.getByLabelText('Amount'));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and reverts the input for a non-positive amount, without calling fetch', async () => {
    renderControls({ amount: 500 });

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Amount'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this entry. Please try again.');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Amount')).toHaveValue(500);
  });

  it('resyncs the displayed amount when the server re-renders with a new amount prop (e.g. after another row refreshed the page)', () => {
    const { rerender } = renderControls({ amount: 500 });
    expect(screen.getByLabelText('Amount')).toHaveValue(500);

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RepCollectionEntryControls orgId="org-1" projectId="project-1" entryId="entry-1" orgPersonId={null} amount={900} people={people} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText('Amount')).toHaveValue(900);
  });

  it('does nothing when the delete confirm dialog is dismissed', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('deletes the entry and refreshes when confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/rep-collections/entry-1', { method: 'DELETE' });
  });

  it('shows an inline error and does not refresh when the delete request fails', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete this entry. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

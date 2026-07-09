import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardSettingsForm } from './board-settings-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardSettingsForm
        orgId="org-1"
        projectId="project-1"
        boardId="board-1"
        initialName="Marketing"
        initialDateRange={{ start: '2026-01-01', end: '2026-01-31', grain: 'day' }}
        initialGlobalFilters={[]}
      />
    </NextIntlClientProvider>,
  );
}

describe('BoardSettingsForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the rename + date range + compare + global filters, and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Revenue' } });
    fireEvent.change(screen.getByLabelText('Compare to'), { target: { value: 'previous_period' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.change(screen.getByLabelText('Filter field'), { target: { value: 'channel' } });
    fireEvent.change(screen.getByLabelText('Filter value'), { target: { value: 'google' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Revenue',
        dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'day' },
        compare: 'previous_period',
        globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
      }),
    });
  });

  it('rejects a start date after the end date client-side, without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The start date must not be after the end date.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save settings. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

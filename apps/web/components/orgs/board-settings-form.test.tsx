import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardSettingsForm, type BoardSettingsFormProps } from './board-settings-form';
import messages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(initialDateRange: BoardSettingsFormProps['initialDateRange'] = { start: '2026-01-01', end: '2026-01-31', grain: 'day' }): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardSettingsForm
        orgId="org-1"
        projectId="project-1"
        boardId="board-1"
        initialName="Marketing"
        initialDateRange={initialDateRange}
        today="2026-09-26"
        initialGlobalFilters={[]}
      />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
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
        dateRange: { kind: 'absolute', start: '2026-01-01', end: '2026-01-31', grain: 'day' },
        compare: 'previous_period',
        globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
      }),
    });
  });

  it('shows a legacy fixed-date board as "Custom dates" with its dates', () => {
    renderForm();

    expect(screen.getByLabelText('Date range')).toHaveValue('custom');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-01-31');
    expect(screen.getByText(/Fixed dates never move/)).toBeInTheDocument();
  });

  it('shows a relative board as its preset with today\'s resolved window, and no date inputs (KAN-211)', () => {
    renderForm({ kind: 'relative', preset: 'last_30_days', grain: 'day' });

    expect(screen.getByLabelText('Date range')).toHaveValue('last_30_days');
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.getByText('Moves forward automatically every day (UTC). Right now: 2026-08-28 to 2026-09-26.')).toBeInTheDocument();
  });

  it('saves a relative preset as { kind: "relative", preset, grain }', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'last_7_days' } });
    expect(screen.getByText('Moves forward automatically every day (UTC). Right now: 2026-09-20 to 2026-09-26.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Granularity'), { target: { value: 'week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastRequestBody().dateRange).toEqual({ kind: 'relative', preset: 'last_7_days', grain: 'week' });
  });

  it('switching a preset to custom dates starts from the window the preset shows today', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm({ kind: 'relative', preset: 'month_to_date', grain: 'day' });

    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'custom' } });
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-09-26');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastRequestBody().dateRange).toEqual({ kind: 'absolute', start: '2026-09-01', end: '2026-09-26', grain: 'day' });
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

  it('renders every preset label in Hebrew too', () => {
    render(
      <NextIntlClientProvider locale="he" messages={heMessages}>
        <BoardSettingsForm
          orgId="org-1"
          projectId="project-1"
          boardId="board-1"
          initialName="Marketing"
          initialDateRange={{ kind: 'relative', preset: 'last_30_days', grain: 'day' }}
          today="2026-09-26"
          initialGlobalFilters={[]}
        />
      </NextIntlClientProvider>,
    );
    const options = [...(screen.getByRole('combobox', { name: heMessages.Boards.dateRangeLabel }) as HTMLSelectElement).options];
    expect(options).toHaveLength(10);
    expect(options.map((option) => option.textContent)).toContain(heMessages.Boards.dateRangePresetOption.last_30_days);
    expect(options.every((option) => option.textContent && !option.textContent.startsWith('Boards.'))).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditGoalForm } from './edit-goal-form';
import type { MetricCatalogEntryRow } from './board-types';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const metricCatalog: MetricCatalogEntryRow[] = [{ name: 'signups', dimensions: [] }, { name: 'cost_per_signup', dimensions: [] }];
const people = [
  { id: 'person-1', name: 'Alex Rep' },
  { id: 'person-2', name: 'Sam Rep' },
];

function renderForm(overrides: Partial<React.ComponentProps<typeof EditGoalForm>> = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditGoalForm
        orgId="org-1"
        projectId="project-1"
        goalId="goal-1"
        metricCatalog={metricCatalog}
        people={people}
        initialName="Q3 signups"
        initialMetricName="signups"
        initialDirection="maximize"
        initialTargetValue={1000}
        initialRangeMin={null}
        initialRangeMax={null}
        initialStartDate="2026-07-01"
        initialDeadline="2026-09-30"
        initialRhythm="even"
        initialOwnerPersonId="person-1"
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditGoalForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit goal button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals every field pre-filled with the current values when Edit goal is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Q3 signups');
    expect(screen.getByLabelText('Metric')).toHaveValue('signups');
    expect(screen.getByLabelText('Direction')).toHaveValue('maximize');
    expect(screen.getByLabelText('Target value')).toHaveValue(1000);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Deadline')).toHaveValue('2026-09-30');
    expect(screen.getByLabelText('Rhythm')).toHaveValue('even');
    expect(screen.getByLabelText('Owner')).toHaveValue('person-1');
  });

  it('pre-fills range inputs for a range goal instead of a single target value', () => {
    renderForm({ initialDirection: 'range', initialTargetValue: null, initialRangeMin: 20, initialRangeMax: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));

    expect(screen.queryByLabelText('Target value')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Range minimum')).toHaveValue(20);
    expect(screen.getByLabelText('Range maximum')).toHaveValue(40);
  });

  it('submits the full definition via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ goal: { id: 'goal-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Q3 signups (revised)' } });
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'person-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/goals/goal-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Q3 signups (revised)',
          metricName: 'signups',
          direction: 'maximize',
          targetValue: 1000,
          startDate: '2026-07-01',
          deadline: '2026-09-30',
          rhythm: 'even',
          ownerPersonId: 'person-2',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeInTheDocument();
  });

  it('switches to range mode and submits rangeMin/rangeMax instead of targetValue', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ goal: { id: 'goal-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'range' } });
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'cost_per_signup' } });
    fireEvent.change(screen.getByLabelText('Range minimum'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Range maximum'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ direction: 'range', rangeMin: 20, rangeMax: 40 });
    expect(body.targetValue).toBeUndefined();
  });

  it('cancels back to the Edit goal button without submitting', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the goal. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateGoalForm } from './create-goal-form';
import type { MetricCatalogEntryRow } from './board-types';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

const metricCatalog: MetricCatalogEntryRow[] = [{ name: 'signups', dimensions: [] }, { name: 'cost_per_signup', dimensions: [] }];
const people = [{ id: 'person-1', name: 'Alex Rep' }];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateGoalForm orgId="org-1" projectId="project-1" metricCatalog={metricCatalog} people={people} />
    </NextIntlClientProvider>,
  );
}

describe('CreateGoalForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('disables the submit button until the required maximize fields are filled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create goal' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Q3 signups' } });
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-09-30' } });

    expect(screen.getByRole('button', { name: 'Create goal' })).toBeEnabled();
  });

  it('creates a maximize goal and navigates to its detail page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ goal: { id: 'goal-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Q3 signups' } });
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/project-1/goals/goal-1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/goals',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Q3 signups',
          metricName: 'signups',
          direction: 'maximize',
          targetValue: 1000,
          startDate: '2026-07-01',
          deadline: '2026-09-30',
          rhythm: 'even',
          ownerPersonId: 'person-1',
        }),
      }),
    );
  });

  it('switches to rangeMin/rangeMax inputs when direction is "range", and posts those instead of targetValue', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ goal: { id: 'goal-2' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'range' } });
    expect(screen.queryByLabelText('Target value')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Range minimum')).toBeInTheDocument();
    expect(screen.getByLabelText('Range maximum')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Healthy CAC band' } });
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'cost_per_signup' } });
    fireEvent.change(screen.getByLabelText('Range minimum'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Range maximum'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/project-1/goals/goal-2'));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ direction: 'range', rangeMin: 20, rangeMax: 40 });
    expect(body.targetValue).toBeUndefined();
  });

  it('shows an inline error and does not navigate when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Q3 signups' } });
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the goal. Please try again.');
    expect(push).not.toHaveBeenCalled();
  });
});

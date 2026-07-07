import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegisterMetricDefForm } from './register-metric-def-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RegisterMetricDefForm orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('RegisterMetricDefForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits an aggregation definition', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ metricDef: { id: 'metric-1', version: 1, status: 'active' } }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ad_spend' } });
    fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'fact_ad_spend' } });
    fireEvent.change(screen.getByLabelText('Column'), { target: { value: 'reporting_spend' } });
    fireEvent.change(screen.getByLabelText('Dimensions (comma-separated)'), { target: { value: 'channel, campaign' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register metric' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/metric-defs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'ad_spend',
            definition: {
              kind: 'aggregation',
              aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [] },
            },
            dimensions: ['channel', 'campaign'],
          }),
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('submits a formula definition when the kind is switched', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ metricDef: { id: 'metric-2', version: 1, status: 'active' } }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'cost_per_signup' } });
    fireEvent.change(screen.getByLabelText('Definition kind'), { target: { value: 'formula' } });
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'ad_spend / signups' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register metric' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/metric-defs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'cost_per_signup',
            definition: { kind: 'formula', formula: 'ad_spend / signups' },
            dimensions: [],
          }),
        }),
      ),
    );
  });

  it('adds and removes filter rows', () => {
    renderForm();
    expect(screen.queryAllByLabelText('Field')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getAllByLabelText('Field')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryAllByLabelText('Field')).toHaveLength(0);
  });

  it('shows a specific error for a duplicate metric, a generic one otherwise', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'duplicate_metric' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ad_spend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register metric' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A metric with this name is already registered in this project.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

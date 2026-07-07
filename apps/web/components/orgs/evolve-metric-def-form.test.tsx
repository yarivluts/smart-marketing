import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EvolveMetricDefForm } from './evolve-metric-def-form';
import { blankMetricDefinitionFormState, type MetricDefinitionFormState } from './metric-definition-editor';
import messages from '../../messages/en.json';

const refresh = vi.fn();
const onClose = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const INITIAL_STATE: MetricDefinitionFormState = {
  ...blankMetricDefinitionFormState(),
  table: 'fact_ad_spend',
  column: 'reporting_spend',
  dimensions: 'channel',
};

function renderForm(initialState: MetricDefinitionFormState = INITIAL_STATE): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EvolveMetricDefForm orgId="org-1" projectId="project-1" name="ad_spend" initialState={initialState} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe('EvolveMetricDefForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    onClose.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is prefilled from the latest version and submits the (possibly edited) definition to the evolve route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ metricDef: { id: 'metric-2', version: 2, status: 'active' } }),
    } as Response);
    renderForm();

    expect(screen.getByDisplayValue('fact_ad_spend')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Dimensions (comma-separated)'), { target: { value: 'channel, campaign' } });

    fireEvent.click(screen.getByRole('button', { name: 'Evolve metric' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/metric-defs/evolve',
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
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the invalid-definition reasons returned by the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_definition', reasons: ['Formula references unknown metric "x".'] }),
    } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Evolve metric' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formula references unknown metric "x".');
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

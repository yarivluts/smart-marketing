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
  timeColumn: 'date',
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
              aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
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


  it('keeps every mounted editor instance independently label-addressable — editing one open evolve form via its label never leaks into (or submits from) a sibling instance', async () => {
    // Regression (session-B QA, 2026-08-20): the editor used FIXED input ids
    // ("metric-def-table", ...), so with the register form + an open evolve
    // form (or two open evolve forms) mounted together, a <label>/id lookup
    // resolved to whichever instance came first in the DOM — values typed
    // "into" one form landed in another form's state, and the submitted
    // evolve silently carried the previous version's aggregation verbatim.
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ metricDef: {} }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EvolveMetricDefForm orgId="org-1" projectId="project-1" name="first_metric" initialState={INITIAL_STATE} onClose={onClose} />
        <EvolveMetricDefForm
          orgId="org-1"
          projectId="project-1"
          name="second_metric"
          initialState={{ ...INITIAL_STATE, table: 'second_table' }}
          onClose={onClose}
        />
      </NextIntlClientProvider>,
    );

    const tableInputs = screen.getAllByLabelText('Table') as HTMLInputElement[];
    expect(tableInputs).toHaveLength(2);
    expect(new Set(tableInputs.map((input) => input.id)).size).toBe(2);

    // Edit the SECOND instance through its own label-resolved input, then
    // submit the second form — the body must carry the edited table.
    fireEvent.change(tableInputs[1], { target: { value: 'brand_new_table_name_v2' } });
    const submitButtons = screen.getAllByRole('button', { name: 'Evolve metric' });
    fireEvent.click(submitButtons[1]);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.name).toBe('second_metric');
    expect(body.definition.aggregation.table).toBe('brand_new_table_name_v2');
    // And the first form's state was untouched.
    expect(tableInputs[0].value).toBe('fact_ad_spend');
  });

  it('calls onClose when Cancel is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

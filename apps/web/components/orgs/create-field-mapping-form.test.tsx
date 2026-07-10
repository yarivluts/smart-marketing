import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateFieldMappingForm } from './create-field-mapping-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateFieldMappingForm
        orgId="org-1"
        projectId="project-1"
        environments={[{ id: 'env-1', name: 'prod' }]}
        hookEndpoints={[{ id: 'endpoint-1', name: 'Shopify' }]}
        schemaNamesByKind={{ event: ['order_completed'], entity: [], measure: [] }}
      />
    </NextIntlClientProvider>,
  );
}

describe('CreateFieldMappingForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name, kind, environment, schema name, and rules', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ fieldMapping: { id: 'mapping-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shopify orders' } });
    fireEvent.change(screen.getByLabelText('Target schema'), { target: { value: 'order_completed' } });
    fireEvent.change(screen.getByPlaceholderText('Target field, e.g. properties.amount'), { target: { value: 'event_id' } });
    fireEvent.change(screen.getByLabelText('Source JSONPath, e.g. data.object.amount'), { target: { value: 'id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create mapping' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/field-mappings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Shopify orders',
            kind: 'event',
            environmentId: 'env-1',
            hookEndpointId: undefined,
            schemaName: 'order_completed',
            rules: [{ targetField: 'event_id', transform: 'rename', sourcePath: 'id', castType: 'string', template: '', staticValue: '' }],
          }),
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('disables submit when no schema of the selected kind is registered', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreateFieldMappingForm
          orgId="org-1"
          projectId="project-1"
          environments={[{ id: 'env-1', name: 'prod' }]}
          hookEndpoints={[]}
          schemaNamesByKind={{ event: [], entity: [], measure: [] }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Create mapping' })).toBeDisabled();
    expect(screen.getByText('No schema of this kind is registered yet — register one first.')).toBeInTheDocument();
  });

  it('shows a specific error when the target schema is not registered, a generic one otherwise', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'target_schema_not_registered' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Target schema'), { target: { value: 'order_completed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create mapping' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The target schema has no active registered version yet. Register it first.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('merges an applied suggestion into the rule editor without clobbering an existing rule for a different field', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith('/field-mappings/suggest')) {
        return {
          ok: true,
          json: async () => ({
            suggestions: [{ targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string', confidence: 0.5 }],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ fieldMapping: { id: 'mapping-1' } }) } as Response;
    });
    renderForm();

    fireEvent.change(screen.getByLabelText('Target schema'), { target: { value: 'order_completed' } });
    fireEvent.change(screen.getByPlaceholderText('Target field, e.g. properties.amount'), { target: { value: 'event_id' } });
    fireEvent.change(screen.getByLabelText('Source JSONPath, e.g. data.object.amount'), { target: { value: 'id' } });

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{"id": 1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByRole('button', { name: 'Apply all' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    const targetFieldInputs = screen.getAllByPlaceholderText('Target field, e.g. properties.amount');
    expect(targetFieldInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['event_id', 'properties.order_id']);
  });

  it('does not drop a row where only the source path has been typed so far when a suggestion is applied elsewhere', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string', confidence: 0.5 }],
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Target schema'), { target: { value: 'order_completed' } });
    // The user has started filling in a row (a source path) but hasn't named its target field yet.
    fireEvent.change(screen.getByLabelText('Source JSONPath, e.g. data.object.amount'), { target: { value: 'created_at' } });

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{"id": 1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByRole('button', { name: 'Apply all' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    const sourcePathInputs = screen.getAllByLabelText('Source JSONPath, e.g. data.object.amount');
    expect(sourcePathInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['created_at', 'id']);
  });

  it('skips a suggestion whose target field already has a row rather than overwriting it', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { targetField: 'event_id', transform: 'cast', sourcePath: 'wrong_id', castType: 'string', confidence: 0.9 },
          { targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string', confidence: 0.5 },
        ],
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Target schema'), { target: { value: 'order_completed' } });
    fireEvent.change(screen.getByPlaceholderText('Target field, e.g. properties.amount'), { target: { value: 'event_id' } });
    fireEvent.change(screen.getByLabelText('Source JSONPath, e.g. data.object.amount'), { target: { value: 'my_own_id' } });

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{"id": 1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByRole('button', { name: 'Apply all' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    const targetFieldInputs = screen.getAllByPlaceholderText('Target field, e.g. properties.amount');
    expect(targetFieldInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['event_id', 'properties.order_id']);
    const sourcePathInputs = screen.getAllByLabelText('Source JSONPath, e.g. data.object.amount');
    expect(sourcePathInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['my_own_id', 'id']);
  });
});

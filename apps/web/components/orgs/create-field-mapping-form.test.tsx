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
});

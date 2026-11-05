import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditFieldMappingForm } from './edit-field-mapping-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const initialRules = [{ targetField: 'event_id', transform: 'rename', sourcePath: 'id' }];

function renderForm(schemaOptions: readonly string[] = ['order_completed', 'order_refunded']): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditFieldMappingForm
        orgId="org-1"
        projectId="project-1"
        fieldMappingId="mapping-1"
        initialName="Shopify orders"
        initialSchemaName="order_completed"
        initialRules={initialRules}
        schemaOptions={schemaOptions}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditFieldMappingForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled with the current name, schema, and rules', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Shopify orders');
    expect(screen.getByLabelText('Where the data goes')).toHaveValue('order_completed');
    expect(screen.getByPlaceholderText('Target field, e.g. properties.amount')).toHaveValue('event_id');
    expect(screen.getByLabelText('Where in the data, e.g. data.object.amount')).toHaveValue('id');
  });

  it('includes the current schema name as an option even if it has fallen out of the active set', () => {
    renderForm([]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const select = screen.getByLabelText('Where the data goes') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['order_completed']);
  });

  it('submits the edited name, schema, and rules via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ fieldMapping: { id: 'mapping-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shopify orders v2' } });
    fireEvent.change(screen.getByLabelText('Where the data goes'), { target: { value: 'order_refunded' } });
    fireEvent.change(screen.getByLabelText('Where in the data, e.g. data.object.amount'), { target: { value: 'other_id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/field-mappings/mapping-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Shopify orders v2',
          schemaName: 'order_refunded',
          rules: [{ targetField: 'event_id', transform: 'rename', sourcePath: 'other_id', castType: 'string', template: '', staticValue: '' }],
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows a specific error when the target schema is not registered, a generic one otherwise', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'target_schema_not_registered' }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The data fields this goes into are not set up yet. Set them up first.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces the server\'s specific validation reasons for an invalid rule set', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_rules', reasons: ['Required field "ts" has no mapping rule.'] }),
    } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was saved. Please fix the following and try again: Required field "ts" has no mapping rule.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a generic inline error and stays open when saving fails without a known error code', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this mapping. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('cancels back to the Edit button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Shopify orders');
  });

  it('falls back to a single blank rule row when initialRules is empty', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditFieldMappingForm
          orgId="org-1"
          projectId="project-1"
          fieldMappingId="mapping-1"
          initialName="Empty rules mapping"
          initialSchemaName="order_completed"
          initialRules={[]}
          schemaOptions={['order_completed']}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByPlaceholderText('Target field, e.g. properties.amount')).toHaveValue('');
  });
});

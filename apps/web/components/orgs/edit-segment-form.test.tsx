import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditSegmentForm } from './edit-segment-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(
  overrides: Partial<{ initialFilters: unknown[]; initialEventConditions: unknown[] }> = {},
): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditSegmentForm
        orgId="org-1"
        projectId="project-1"
        segmentId="segment-1"
        entitySchemaNames={['customer', 'stripe_subscription']}
        initialName="Pro customers"
        initialSchemaName="customer"
        initialFilters={(overrides.initialFilters as never) ?? [{ field: 'plan', op: '=', value: 'pro' }]}
        initialEventConditions={(overrides.initialEventConditions as never) ?? []}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditSegmentForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled with the current definition', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Pro customers');
    expect(screen.getByLabelText('Entity')).toHaveValue('customer');
    expect(screen.getByLabelText('Filters (JSON)')).toHaveValue(JSON.stringify([{ field: 'plan', op: '=', value: 'pro' }], null, 2));
    expect(screen.getByLabelText('Event conditions (JSON)')).toHaveValue('[]');
  });

  it('pre-fills event conditions as pretty-printed JSON when present', () => {
    renderForm({ initialEventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Event conditions (JSON)')).toHaveValue(JSON.stringify([{ kind: 'no_event', schemaName: 'demo_event' }], null, 2));
  });

  it('submits the edited definition via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro customers, renamed' } });
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'stripe_subscription' } });
    fireEvent.change(screen.getByLabelText('Filters (JSON)'), { target: { value: '[{"field": "status", "op": "=", "value": "active"}]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Pro customers, renamed',
          schemaName: 'stripe_subscription',
          filters: [{ field: 'status', op: '=', value: 'active' }],
          eventConditions: [],
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('treats a blank filters/event-conditions textarea as an empty array', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Filters (JSON)'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ body: JSON.stringify({ name: 'Pro customers', schemaName: 'customer', filters: [], eventConditions: [] }) }),
    );
  });

  it('shows an inline error and never calls fetch for malformed filters JSON', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Filters (JSON)'), { target: { value: '{not valid json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Filters must be a valid JSON array of {field, op, value} conditions.');
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error for filters JSON containing a structurally invalid condition', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Filters (JSON)'), { target: { value: '[{"field": "plan"}]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Filters must be a valid JSON array of {field, op, value} conditions.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error for malformed event-conditions JSON', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Event conditions (JSON)'), { target: { value: '[{"kind": "sometimes_event", "schemaName": "x"}]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Event conditions must be a valid JSON array of {kind, schemaName, ...} conditions.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels back to the Edit button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard Me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Pro customers');
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the segment. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});

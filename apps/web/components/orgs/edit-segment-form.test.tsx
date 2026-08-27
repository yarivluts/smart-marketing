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
  overrides: Partial<{ eventSchemaNames: string[]; initialFilters: unknown[]; initialEventConditions: unknown[] }> = {},
): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditSegmentForm
        orgId="org-1"
        projectId="project-1"
        segmentId="segment-1"
        entitySchemaNames={['customer', 'stripe_subscription']}
        eventSchemaNames={overrides.eventSchemaNames ?? []}
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

  it('reveals the fields pre-filled with the current definition as row-editor state', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Pro customers');
    expect(screen.getByLabelText('Entity')).toHaveValue('customer');
    expect(screen.getByLabelText('Field')).toHaveValue('plan');
    expect(screen.getByLabelText('Value')).toHaveValue('pro');
  });

  it('pre-fills a numeric/boolean filter value as its string form (same posture CreateSegmentForm submits with)', () => {
    renderForm({ initialFilters: [{ field: 'mrr_usd', op: '>=', value: 100 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Value')).toHaveValue('100');
  });

  it('pre-fills event conditions as rows when present', () => {
    renderForm({ eventSchemaNames: ['demo_event'], initialEventConditions: [{ kind: 'no_event', schemaName: 'demo_event', withinDays: 30 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Condition')).toHaveValue('no_event');
    expect(screen.getByLabelText('Event')).toHaveValue('demo_event');
    expect(screen.getByLabelText('Within days')).toHaveValue(30);
  });

  it('submits the edited definition via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro customers, renamed' } });
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'stripe_subscription' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'status' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'active' } });
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

  it('lets every filter row be removed, saving an empty filters array (no minimum, unlike CreateSegmentForm)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({ body: JSON.stringify({ name: 'Pro customers', schemaName: 'customer', filters: [], eventConditions: [] }) }),
    );
  });

  it('adds and edits an event condition row, submitting it alongside the existing filter', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm({ eventSchemaNames: ['demo_event'] });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'has_event' } });
    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments/segment-1',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Pro customers',
          schemaName: 'customer',
          filters: [{ field: 'plan', op: '=', value: 'pro' }],
          eventConditions: [{ kind: 'has_event', schemaName: 'demo_event', withinDays: 30 }],
        }),
      }),
    );
  });

  it('disables Save until every filter row is filled', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Save until every event condition row has a valid withinDays', () => {
    renderForm({ eventSchemaNames: ['demo_event'] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '-5' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '10' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
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

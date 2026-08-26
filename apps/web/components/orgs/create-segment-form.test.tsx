import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateSegmentForm } from './create-segment-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(eventSchemaNames: string[] = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateSegmentForm orgId="org-1" projectId="project-1" entitySchemaNames={['customer']} eventSchemaNames={eventSchemaNames} />
    </NextIntlClientProvider>,
  );
}

describe('CreateSegmentForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('disables the submit button until name and every filter row is filled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro customers' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'plan' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();
  });

  it('creates a segment and refreshes the page', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro customers' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'plan' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create segment' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Pro customers',
          schemaName: 'customer',
          filters: [{ field: 'plan', op: '=', value: 'pro' }],
          eventConditions: [],
        }),
      }),
    );
  });

  it('adds and removes filter rows', () => {
    renderForm();
    expect(screen.getAllByLabelText('Field')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getAllByLabelText('Field')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Field')).toHaveLength(1);

    // The last remaining row cannot be removed.
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro customers' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'plan' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create segment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the segment. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('fills the name from an applied suggestion when the name field is still blank, and replaces the filter rows', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ name: 'High-value customers', filters: [{ field: 'mrr_usd', op: '>=', value: 100 }], confidence: 0.85 }],
      }),
    } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('High-value customers (85% match)');
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));

    expect(screen.getByLabelText('Name')).toHaveValue('High-value customers');
    expect(screen.getByLabelText('Field')).toHaveValue('mrr_usd');
    expect(screen.getByLabelText('Value')).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();
  });

  it('never overwrites a name the user already typed when applying a suggestion', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ name: 'High-value customers', filters: [{ field: 'mrr_usd', op: '>=', value: 100 }], confidence: 0.85 }],
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My own name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('High-value customers (85% match)');
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));

    expect(screen.getByLabelText('Name')).toHaveValue('My own name');
  });

  it('does not render the event conditions section when no event schemas are registered', () => {
    renderForm([]);
    expect(screen.queryByText('Event conditions')).not.toBeInTheDocument();
  });

  it('lets a segment be created from only an event condition, with zero entity filters (the "paying_no_demo" case, KAN-93)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm(['demo_event']);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'No demo yet' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    // Adding an event condition unlocks removing the single default (empty)
    // filter row — a segment can now stand on an event condition alone. The
    // filter row's own remove button is the first "Remove" in DOM order.
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Create segment' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'No demo yet',
          schemaName: 'customer',
          filters: [],
          eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }],
        }),
      }),
    );
  });

  it('submits a withinDays lookback as a number, and omits it entirely when left blank', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm(['demo_event']);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Held a demo recently' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'plan' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'has_event' } });
    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create segment' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Held a demo recently',
          schemaName: 'customer',
          filters: [{ field: 'plan', op: '=', value: 'pro' }],
          eventConditions: [{ kind: 'has_event', schemaName: 'demo_event', withinDays: 30 }],
        }),
      }),
    );
  });

  it('disables submit until every event condition row has a target schema and a valid withinDays', () => {
    renderForm(['demo_event']);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'plan' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '-5' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Within days'), { target: { value: '10' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();
  });

  it('adds and removes event condition rows', () => {
    renderForm(['demo_event']);
    expect(screen.queryAllByLabelText('Condition')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    expect(screen.getAllByLabelText('Condition')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    expect(screen.getAllByLabelText('Condition')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!);
    expect(screen.getAllByLabelText('Condition')).toHaveLength(1);
  });

  it('adds and removes nested filter rows within an event condition (KAN-95)', () => {
    renderForm(['demo_event']);
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    expect(screen.queryAllByLabelText('Event filter field')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add event filter' }));
    expect(screen.getAllByLabelText('Event filter field')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add event filter' }));
    expect(screen.getAllByLabelText('Event filter field')).toHaveLength(2);

    // The top-level filter row's "Remove" is first in DOM order; the two nested
    // event-filter rows' "Remove" buttons come after it.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByLabelText('Event filter field')).toHaveLength(1);
  });

  it('submits a nested event-condition filter, and omits the key entirely when no nested filters were added', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ segment: { id: 'segment-1' } }) } as Response);
    renderForm(['demo_event']);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Held a paid demo recently' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'has_event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event filter' }));
    fireEvent.change(screen.getByLabelText('Event filter field'), { target: { value: 'is_paid' } });
    fireEvent.change(screen.getByLabelText('Event filter value'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create segment' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/segments',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Held a paid demo recently',
          schemaName: 'customer',
          filters: [],
          eventConditions: [{ kind: 'has_event', schemaName: 'demo_event', filters: [{ field: 'is_paid', op: '=', value: 'true' }] }],
        }),
      }),
    );
  });

  it('disables submit until every nested event-condition filter row is filled', () => {
    renderForm(['demo_event']);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event condition' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add event filter' }));
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Event filter field'), { target: { value: 'is_paid' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Event filter value'), { target: { value: 'true' } });
    expect(screen.getByRole('button', { name: 'Create segment' })).toBeEnabled();
  });
});

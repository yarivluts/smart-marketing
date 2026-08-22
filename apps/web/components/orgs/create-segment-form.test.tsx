import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateSegmentForm } from './create-segment-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateSegmentForm orgId="org-1" projectId="project-1" entitySchemaNames={['customer']} />
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
});

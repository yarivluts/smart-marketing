import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SuggestFieldMappingsPanel } from './suggest-field-mappings-panel';
import messages from '../../messages/en.json';

function renderPanel(onApplySuggestions = vi.fn(), schemaName = 'order_completed') {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SuggestFieldMappingsPanel orgId="org-1" projectId="project-1" kind="event" schemaName={schemaName} onApplySuggestions={onApplySuggestions} />
    </NextIntlClientProvider>,
  );
  return onApplySuggestions;
}

describe('SuggestFieldMappingsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is collapsed by default', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Suggest mappings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Sample payload to propose mappings from (JSON)')).not.toBeInTheDocument();
  });

  it('is disabled until a target schema is chosen', () => {
    renderPanel(vi.fn(), '');
    expect(screen.getByRole('button', { name: 'Suggest mappings' })).toBeDisabled();
  });

  it('requests suggestions for the pasted sample and lists them', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string', confidence: 0.45 },
        ],
      }),
    } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{"id": 1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/field-mappings/suggest',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ kind: 'event', schemaName: 'order_completed', samplePayload: '{"id": 1}' }),
        }),
      ),
    );
    expect(await screen.findByText('properties.order_id ← id (45% match)')).toBeInTheDocument();
  });

  it('applies one suggestion as a rule row without waiting for "Apply all"', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ targetField: 'ts', transform: 'cast', sourcePath: 'created_at', castType: 'timestamp', confidence: 0.3 }],
      }),
    } as Response);
    const onApplySuggestions = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{"created_at": "x"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('ts ← created_at (30% match)');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApplySuggestions).toHaveBeenCalledWith([
      { targetField: 'ts', transform: 'cast', sourcePath: 'created_at', castType: 'timestamp', template: '', staticValue: '' },
    ]);
  });

  it('applies every suggestion at once via "Apply all"', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { targetField: 'ts', transform: 'cast', sourcePath: 'created_at', castType: 'timestamp', confidence: 0.3 },
          { targetField: 'properties.email', transform: 'rename', sourcePath: 'email', confidence: 1 },
        ],
      }),
    } as Response);
    const onApplySuggestions = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByRole('button', { name: 'Apply all' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    expect(onApplySuggestions).toHaveBeenCalledWith([
      { targetField: 'ts', transform: 'cast', sourcePath: 'created_at', castType: 'timestamp', template: '', staticValue: '' },
      { targetField: 'properties.email', transform: 'rename', sourcePath: 'email', castType: 'string', template: '', staticValue: '' },
    ]);
  });

  it('shows a message when there are no confident suggestions', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByText('No confident suggestions for this sample — add rules by hand below.')).toBeInTheDocument();
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }));
    fireEvent.change(screen.getByLabelText('Sample payload to propose mappings from (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't get suggestions. Please try again.");
  });
});

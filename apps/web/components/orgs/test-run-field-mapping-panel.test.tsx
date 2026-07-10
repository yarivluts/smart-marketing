import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TestRunFieldMappingPanel } from './test-run-field-mapping-panel';
import messages from '../../messages/en.json';

function renderPanel(hookDeliveries: { id: string; receivedAt: string }[] = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TestRunFieldMappingPanel orgId="org-1" projectId="project-1" fieldMappingId="mapping-1" hookDeliveries={hookDeliveries} />
    </NextIntlClientProvider>,
  );
}

describe('TestRunFieldMappingPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is collapsed by default', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Test run' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Sample payload (JSON)')).not.toBeInTheDocument();
  });

  it('runs a test against pasted JSON and shows the mapped record on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ record: { event_id: 'evt_1' }, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
    } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), { target: { value: '{"id": 1}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/field-mappings/test-run',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fieldMappingId: 'mapping-1', samplePayload: '{"id": 1}' }),
        }),
      ),
    );
    expect(await screen.findByText('Mapped record is valid for the target schema.')).toBeInTheDocument();
    expect(screen.getByText(/"event_id": "evt_1"/)).toBeInTheDocument();
  });

  it('shows mapping errors instead of the success message when the run has them', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ record: {}, errors: ['event_id:not_found:id'], envelopeErrors: [], schemaRegistered: false, schemaValidationErrors: [] }),
    } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Mapping errors: event_id:not_found:id')).toBeInTheDocument();
    expect(screen.queryByText('Mapped record is valid for the target schema.')).not.toBeInTheDocument();
  });

  it('lets a delivery be picked as the sample instead of pasting JSON', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ record: {}, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
    } as Response);
    renderPanel([{ id: 'delivery-1', receivedAt: '2024-01-01T00:00:00Z' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample source'), { target: { value: 'delivery-1' } });
    expect(screen.queryByLabelText('Sample payload (JSON)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/field-mappings/test-run',
        expect.objectContaining({ body: JSON.stringify({ fieldMappingId: 'mapping-1', hookDeliveryId: 'delivery-1' }) }),
      ),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't run this test. Please try again.");
  });
});

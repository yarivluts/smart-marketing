import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TestRunFieldMappingPanel } from './test-run-field-mapping-panel';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderPanel(hookDeliveries: { id: string; receivedAt: string }[] = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TestRunFieldMappingPanel orgId="org-1" projectId="project-1" fieldMappingId="mapping-1" hookDeliveries={hookDeliveries} />
    </NextIntlClientProvider>,
  );
}

describe('TestRunFieldMappingPanel', () => {
  beforeEach(() => {
    refresh.mockClear();
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

  it('does not offer "Apply to delivery" for a successful run against pasted JSON (no delivery selected)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ record: {}, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
    } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await screen.findByText('Mapped record is valid for the target schema.');
    expect(screen.queryByRole('button', { name: 'Apply to delivery' })).not.toBeInTheDocument();
  });

  it('applies a clean run against a selected delivery, shows the ingest summary, and refreshes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ record: { event_id: 'evt_1' }, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          record: { event_id: 'evt_1' },
          errors: [],
          envelopeErrors: [],
          schemaRegistered: true,
          schemaValidationErrors: [],
          applied: true,
          ingestSummary: { accepted: 1, quarantined: 0, duplicates: 0 },
        }),
      } as Response);
    renderPanel([{ id: 'delivery-1', receivedAt: '2024-01-01T00:00:00Z' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample source'), { target: { value: 'delivery-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByText('Mapped record is valid for the target schema.');

    fireEvent.click(screen.getByRole('button', { name: 'Apply to delivery' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/orgs/org-1/projects/project-1/field-mappings/mapping-1/apply',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ hookDeliveryId: 'delivery-1' }) }),
      ),
    );
    expect(await screen.findByText('Applied to the ingest pipeline: 1 accepted, 0 quarantined, 0 duplicate.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('shows an inline error when apply fails at the network/HTTP level', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ record: {}, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);
    renderPanel([{ id: 'delivery-1', receivedAt: '2024-01-01T00:00:00Z' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample source'), { target: { value: 'delivery-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByText('Mapped record is valid for the target schema.');

    fireEvent.click(screen.getByRole('button', { name: 'Apply to delivery' }));

    expect(await screen.findByText("Couldn't apply this mapping. Please try again.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a validation-changed message when apply re-validates as invalid', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ record: {}, errors: [], envelopeErrors: [], schemaRegistered: true, schemaValidationErrors: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          record: {},
          errors: [],
          envelopeErrors: [],
          schemaRegistered: true,
          schemaValidationErrors: ['unregistered_field:x'],
          applied: false,
        }),
      } as Response);
    renderPanel([{ id: 'delivery-1', receivedAt: '2024-01-01T00:00:00Z' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Test run' }));
    fireEvent.change(screen.getByLabelText('Sample source'), { target: { value: 'delivery-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByText('Mapped record is valid for the target schema.');

    fireEvent.click(screen.getByRole('button', { name: 'Apply to delivery' }));

    expect(await screen.findByText("This delivery no longer maps cleanly (see errors above) — nothing was applied.")).toBeInTheDocument();
    expect(screen.getByText('Schema validation errors: unregistered_field:x')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

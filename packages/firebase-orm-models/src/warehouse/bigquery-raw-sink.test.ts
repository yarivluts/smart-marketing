import { describe, expect, it } from 'vitest';
import type { PipelineRecordEnvelope } from '../pipeline/record';
import { BigQueryRawRecordSink, type BigQueryInsertClient, type BigQueryInsertRow } from './bigquery-raw-sink';

function fakeClient(): { client: BigQueryInsertClient; calls: Array<{ datasetId: string; tableId: string; rows: readonly BigQueryInsertRow[] }> } {
  const calls: Array<{ datasetId: string; tableId: string; rows: readonly BigQueryInsertRow[] }> = [];
  return {
    calls,
    client: {
      insertRows: async (datasetId, tableId, rows) => {
        calls.push({ datasetId, tableId, rows });
      },
    },
  };
}

const row: PipelineRecordEnvelope = {
  organizationId: 'org-1',
  projectId: 'proj-1',
  environmentId: 'env-1',
  batchId: 'batch-1',
  kind: 'event',
  schemaName: 'order_completed',
  clientId: 'evt-1',
  payload: { net: 349, currency: 'USD' },
};

describe('BigQueryRawRecordSink', () => {
  it('inserts one row into the configured dataset and the default raw_records table, keyed by the message id', async () => {
    const { client, calls } = fakeClient();
    const sink = new BigQueryRawRecordSink({ client, dataset: 'growthos_raw' });

    await sink.insertRawRecord(row, 'pipeline-msg-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].datasetId).toBe('growthos_raw');
    expect(calls[0].tableId).toBe('raw_records');
    expect(calls[0].rows).toHaveLength(1);
    expect(calls[0].rows[0].insertId).toBe('pipeline-msg-1');
  });

  it('maps every PipelineRecordEnvelope field to its raw_records column, JSON-stringifying the payload', async () => {
    const { client, calls } = fakeClient();
    const sink = new BigQueryRawRecordSink({ client, dataset: 'growthos_raw' });

    await sink.insertRawRecord(row, 'pipeline-msg-1');

    const json = calls[0].rows[0].json;
    expect(json.raw_record_id).toBe('pipeline-msg-1');
    expect(json.organization_id).toBe('org-1');
    expect(json.project_id).toBe('proj-1');
    expect(json.environment_id).toBe('env-1');
    expect(json.batch_id).toBe('batch-1');
    expect(json.kind).toBe('event');
    expect(json.schema_name).toBe('order_completed');
    expect(json.client_id).toBe('evt-1');
    expect(json.payload).toBe(JSON.stringify({ net: 349, currency: 'USD' }));
    expect(json.partition_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(json.landed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(json.partition_date).toBe((json.landed_at as string).slice(0, 10));
  });

  it('uses a custom table name when configured', async () => {
    const { client, calls } = fakeClient();
    const sink = new BigQueryRawRecordSink({ client, dataset: 'growthos_raw', table: 'raw_records_test' });

    await sink.insertRawRecord(row, 'pipeline-msg-1');

    expect(calls[0].tableId).toBe('raw_records_test');
  });

  it('propagates a client-side insert failure rather than swallowing it', async () => {
    const client: BigQueryInsertClient = {
      insertRows: async () => {
        throw new Error('simulated BigQuery outage');
      },
    };
    const sink = new BigQueryRawRecordSink({ client, dataset: 'growthos_raw' });

    await expect(sink.insertRawRecord(row, 'pipeline-msg-1')).rejects.toThrow('simulated BigQuery outage');
  });
});

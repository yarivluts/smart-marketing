import { describe, expect, it } from 'vitest';
import type { PipelineRecordEnvelope } from './record';
import {
  DualWarehouseSink,
  FirestoreWarehouseSink,
  readWarehouseSinkEnvConfig,
  resolveWarehouseSinkFromEnv,
  type WarehouseSink,
} from './sink';

const row: PipelineRecordEnvelope = {
  organizationId: 'org-1',
  projectId: 'proj-1',
  environmentId: 'env-1',
  batchId: 'batch-1',
  kind: 'event',
  schemaName: 'order_completed',
  clientId: 'evt-1',
  payload: { net: 349 },
};

function recordingSink(log: string[], name: string, fail = false): WarehouseSink {
  return {
    insertRawRecord: async () => {
      log.push(name);
      if (fail) {
        throw new Error(`${name} failed`);
      }
    },
  };
}

describe('DualWarehouseSink', () => {
  it('writes to the primary sink then the secondary sink, in order', async () => {
    const log: string[] = [];
    const sink = new DualWarehouseSink(recordingSink(log, 'primary'), recordingSink(log, 'secondary'));

    await sink.insertRawRecord(row, 'msg-1');

    expect(log).toEqual(['primary', 'secondary']);
  });

  it('propagates a primary-sink failure without calling the secondary sink', async () => {
    const log: string[] = [];
    const sink = new DualWarehouseSink(recordingSink(log, 'primary', true), recordingSink(log, 'secondary'));

    await expect(sink.insertRawRecord(row, 'msg-1')).rejects.toThrow('primary failed');
    expect(log).toEqual(['primary']);
  });

  it('propagates a secondary-sink failure even though the primary write already succeeded', async () => {
    const log: string[] = [];
    const sink = new DualWarehouseSink(recordingSink(log, 'primary'), recordingSink(log, 'secondary', true));

    await expect(sink.insertRawRecord(row, 'msg-1')).rejects.toThrow('secondary failed');
    expect(log).toEqual(['primary', 'secondary']);
  });
});

describe('readWarehouseSinkEnvConfig', () => {
  it('reads GOOGLE_CLOUD_PROJECT over GCLOUD_PROJECT, plus the GrowthOS-specific raw dataset var', () => {
    expect(
      readWarehouseSinkEnvConfig({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84', GCLOUD_PROJECT: 'other', GROWTHOS_BIGQUERY_RAW_DATASET: 'growthos_raw' }),
    ).toEqual({ projectId: 'growthos-g2w84', dataset: 'growthos_raw' });
  });

  it('falls back to GCLOUD_PROJECT when GOOGLE_CLOUD_PROJECT is unset', () => {
    expect(readWarehouseSinkEnvConfig({ GCLOUD_PROJECT: 'growthos-g2w84' }).projectId).toBe('growthos-g2w84');
  });

  it('returns undefined fields from an empty env', () => {
    expect(readWarehouseSinkEnvConfig({})).toEqual({ projectId: undefined, dataset: undefined });
  });
});

describe('resolveWarehouseSinkFromEnv', () => {
  it('returns a plain FirestoreWarehouseSink when the project id is missing', () => {
    expect(resolveWarehouseSinkFromEnv({ GROWTHOS_BIGQUERY_RAW_DATASET: 'growthos_raw' })).toBeInstanceOf(FirestoreWarehouseSink);
  });

  it('returns a plain FirestoreWarehouseSink when the dataset is missing', () => {
    expect(resolveWarehouseSinkFromEnv({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84' })).toBeInstanceOf(FirestoreWarehouseSink);
  });

  it('returns a DualWarehouseSink once both a project id and a dataset are configured', () => {
    const sink = resolveWarehouseSinkFromEnv({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84', GROWTHOS_BIGQUERY_RAW_DATASET: 'growthos_raw' });
    expect(sink).toBeInstanceOf(DualWarehouseSink);
  });
});

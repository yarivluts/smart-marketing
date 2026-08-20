import { describe, expect, it } from 'vitest';
import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQueryWarehouseQueryExecutor } from './bigquery-query-executor';
import {
  defaultWarehouseQueryExecutor,
  NotConfiguredWarehouseQueryExecutor,
  readWarehouseEnvConfig,
  resolveWarehouseQueryExecutorFromEnv,
  supportsQueryStats,
  WarehouseNotConfiguredError,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from './query-executor';

describe('NotConfiguredWarehouseQueryExecutor', () => {
  it('rejects every query with WarehouseNotConfiguredError', async () => {
    const executor = new NotConfiguredWarehouseQueryExecutor();
    await expect(executor.execute()).rejects.toThrow(WarehouseNotConfiguredError);
  });

  it('is the shared default executor in every environment today (no BigQuery env vars are set anywhere yet, including CI)', () => {
    expect(defaultWarehouseQueryExecutor).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });
});

describe('readWarehouseEnvConfig', () => {
  it('reads GOOGLE_CLOUD_PROJECT over GCLOUD_PROJECT, plus the GrowthOS-specific dataset/location vars', () => {
    expect(
      readWarehouseEnvConfig({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84', GCLOUD_PROJECT: 'other', GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core', GROWTHOS_BIGQUERY_LOCATION: 'me-west1' }),
    ).toEqual({ projectId: 'growthos-g2w84', dataset: 'growthos_core', location: 'me-west1' });
  });

  it('falls back to GCLOUD_PROJECT when GOOGLE_CLOUD_PROJECT is unset', () => {
    expect(readWarehouseEnvConfig({ GCLOUD_PROJECT: 'growthos-g2w84' }).projectId).toBe('growthos-g2w84');
  });

  it('returns undefined fields from an empty env', () => {
    expect(readWarehouseEnvConfig({})).toEqual({ projectId: undefined, dataset: undefined, location: undefined });
  });
});

describe('resolveWarehouseQueryExecutorFromEnv', () => {
  it('returns NotConfiguredWarehouseQueryExecutor when the project id is missing', () => {
    expect(resolveWarehouseQueryExecutorFromEnv({ GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' })).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });

  it('returns NotConfiguredWarehouseQueryExecutor when the dataset is missing', () => {
    expect(resolveWarehouseQueryExecutorFromEnv({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84' })).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });

  it('returns a real BigQueryWarehouseQueryExecutor once both a project id and a dataset are configured', () => {
    expect(
      resolveWarehouseQueryExecutorFromEnv({ GOOGLE_CLOUD_PROJECT: 'growthos-g2w84', GROWTHOS_BIGQUERY_CORE_DATASET: 'growthos_core' }),
    ).toBeInstanceOf(BigQueryWarehouseQueryExecutor);
  });
});

class PlainExecutor implements WarehouseQueryExecutor {
  execute(): Promise<WarehouseRow[]> {
    return Promise.resolve([]);
  }
}

describe('supportsQueryStats', () => {
  it('is false for an executor with no executeWithStats method (e.g. NotConfiguredWarehouseQueryExecutor, a plain test fake)', () => {
    expect(supportsQueryStats(new NotConfiguredWarehouseQueryExecutor())).toBe(false);
    expect(supportsQueryStats(new PlainExecutor())).toBe(false);
  });

  it('is true for the real BigQueryWarehouseQueryExecutor', () => {
    const executor = new BigQueryWarehouseQueryExecutor({
      client: { query: async () => [[]] },
      dataset: 'growthos_core',
    });
    expect(supportsQueryStats(executor)).toBe(true);
  });

  it('narrows the type so executeWithStats is callable without a cast', async () => {
    const executor: WarehouseQueryExecutor = new BigQueryWarehouseQueryExecutor({
      client: { query: async () => [[{ ad_spend: 1 }]] },
      dataset: 'growthos_core',
    });
    const compiled: CompiledMetricQuery = { sql: 'SELECT 1', params: {} };
    expect(supportsQueryStats(executor)).toBe(true);
    if (supportsQueryStats(executor)) {
      const { rows } = await executor.executeWithStats(compiled);
      expect(rows).toEqual([{ ad_spend: 1 }]);
    }
  });
});

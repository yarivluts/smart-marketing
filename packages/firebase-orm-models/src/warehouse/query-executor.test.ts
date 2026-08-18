import { describe, expect, it } from 'vitest';
import { BigQueryWarehouseQueryExecutor } from './bigquery-query-executor';
import {
  defaultWarehouseQueryExecutor,
  NotConfiguredWarehouseQueryExecutor,
  readWarehouseEnvConfig,
  resolveWarehouseQueryExecutorFromEnv,
  WarehouseNotConfiguredError,
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

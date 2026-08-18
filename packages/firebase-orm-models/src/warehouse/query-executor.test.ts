import { describe, expect, it } from 'vitest';
import { BigQueryWarehouseQueryExecutor } from './bigquery-query-executor';
import {
  defaultWarehouseQueryExecutor,
  NotConfiguredWarehouseQueryExecutor,
  resolveDefaultWarehouseQueryExecutor,
  WarehouseNotConfiguredError,
} from './query-executor';

describe('NotConfiguredWarehouseQueryExecutor', () => {
  it('rejects every query with WarehouseNotConfiguredError', async () => {
    const executor = new NotConfiguredWarehouseQueryExecutor();
    await expect(executor.execute()).rejects.toThrow(WarehouseNotConfiguredError);
  });

  it('is the shared default executor when no BigQuery project is configured', () => {
    expect(defaultWarehouseQueryExecutor).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });
});

describe('resolveDefaultWarehouseQueryExecutor', () => {
  it('falls back to NotConfiguredWarehouseQueryExecutor when GROWTHOS_BIGQUERY_PROJECT_ID is unset', () => {
    const executor = resolveDefaultWarehouseQueryExecutor({});
    expect(executor).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });

  it('falls back to NotConfiguredWarehouseQueryExecutor when GROWTHOS_BIGQUERY_PROJECT_ID is an empty string', () => {
    const executor = resolveDefaultWarehouseQueryExecutor({ GROWTHOS_BIGQUERY_PROJECT_ID: '' });
    expect(executor).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });

  it('switches to a real BigQueryWarehouseQueryExecutor once GROWTHOS_BIGQUERY_PROJECT_ID is set', () => {
    const executor = resolveDefaultWarehouseQueryExecutor({ GROWTHOS_BIGQUERY_PROJECT_ID: 'growthos-g2w84' });
    expect(executor).toBeInstanceOf(BigQueryWarehouseQueryExecutor);
  });

  it('accepts GROWTHOS_BIGQUERY_LOCATION/GROWTHOS_BIGQUERY_DATASET overrides without throwing', () => {
    const executor = resolveDefaultWarehouseQueryExecutor({
      GROWTHOS_BIGQUERY_PROJECT_ID: 'growthos-g2w84',
      GROWTHOS_BIGQUERY_LOCATION: 'us-central1',
      GROWTHOS_BIGQUERY_DATASET: 'growthos_core_staging',
    });
    expect(executor).toBeInstanceOf(BigQueryWarehouseQueryExecutor);
  });
});

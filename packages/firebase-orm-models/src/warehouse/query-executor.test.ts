import { describe, expect, it } from 'vitest';
import { defaultWarehouseQueryExecutor, NotConfiguredWarehouseQueryExecutor, WarehouseNotConfiguredError } from './query-executor';

describe('NotConfiguredWarehouseQueryExecutor', () => {
  it('rejects every query with WarehouseNotConfiguredError', async () => {
    const executor = new NotConfiguredWarehouseQueryExecutor();
    await expect(executor.execute()).rejects.toThrow(WarehouseNotConfiguredError);
  });

  it('is the shared default executor', () => {
    expect(defaultWarehouseQueryExecutor).toBeInstanceOf(NotConfiguredWarehouseQueryExecutor);
  });
});

import { describe, expect, it } from 'vitest';
import { dailyDeliveriesByStatus, deliveryStatusCounts, endpointDeliveryStats, type HookDeliveryLike } from './hook-viz';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

const deliveries: HookDeliveryLike[] = [
  { hook_endpoint_id: 'a', status: 'pending', received_at: '2026-09-26T08:00:00.000Z' },
  { hook_endpoint_id: 'a', status: 'reviewed', received_at: '2026-09-25T08:00:00.000Z', applied_at: '2026-09-25T09:00:00.000Z' },
  { hook_endpoint_id: 'b', status: 'discarded', received_at: '2026-09-26T09:00:00.000Z' },
  { hook_endpoint_id: 'a', status: 'pending', received_at: '2026-08-01T08:00:00.000Z' },
];

describe('deliveryStatusCounts', () => {
  it('counts each status and the applied ones', () => {
    expect(deliveryStatusCounts(deliveries)).toEqual({ pending: 2, reviewed: 1, discarded: 1, applied: 1 });
  });
});

describe('dailyDeliveriesByStatus', () => {
  it('buckets the trailing window per day and status, dropping older deliveries', () => {
    expect(dailyDeliveriesByStatus(deliveries, NOW, 2)).toEqual([
      { date: '2026-09-25', pending: 0, reviewed: 1, discarded: 0 },
      { date: '2026-09-26', pending: 1, reviewed: 0, discarded: 1 },
    ]);
  });
});

describe('endpointDeliveryStats', () => {
  it('summarizes each endpoint', () => {
    const stats = endpointDeliveryStats(deliveries, NOW, 3);
    expect(stats.get('a')).toEqual({ total: 3, pending: 2, lastReceivedAt: '2026-09-26T08:00:00.000Z', daily: [0, 1, 1] });
    expect(stats.get('b')).toMatchObject({ total: 1, pending: 0, daily: [0, 0, 1] });
    expect(stats.has('c')).toBe(false);
  });
});

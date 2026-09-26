import { dailyCountsFrom } from './recency';

/**
 * Delivery shaping for the inbound hooks page, over the deliveries the page already loads.
 */

export type HookDeliveryStatusLike = 'pending' | 'reviewed' | 'discarded';

export interface HookDeliveryLike {
  hook_endpoint_id: string;
  status: HookDeliveryStatusLike;
  received_at: string;
  applied_at?: string;
}

export interface DeliveryStatusCounts {
  pending: number;
  reviewed: number;
  discarded: number;
  /** Deliveries a field mapping turned into records (any status). */
  applied: number;
}

export function deliveryStatusCounts(deliveries: readonly HookDeliveryLike[]): DeliveryStatusCounts {
  const counts: DeliveryStatusCounts = { pending: 0, reviewed: 0, discarded: 0, applied: 0 };
  for (const delivery of deliveries) {
    counts[delivery.status] += 1;
    if (delivery.applied_at) counts.applied += 1;
  }
  return counts;
}

/** One row per UTC day for the trailing `days` days (oldest first), counting deliveries received that day by their current status. */
export function dailyDeliveriesByStatus(deliveries: readonly HookDeliveryLike[], nowMs: number, days: number): { date: string; pending: number; reviewed: number; discarded: number }[] {
  const perStatus = (status: HookDeliveryStatusLike) =>
    dailyCountsFrom(
      deliveries.filter((delivery) => delivery.status === status).map((delivery) => delivery.received_at),
      nowMs,
      days,
    );
  const pending = perStatus('pending');
  const reviewed = perStatus('reviewed');
  const discarded = perStatus('discarded');
  return pending.map((bucket, index) => ({ date: bucket.date, pending: bucket.count, reviewed: reviewed[index].count, discarded: discarded[index].count }));
}

export interface EndpointDeliveryStats {
  total: number;
  pending: number;
  lastReceivedAt: string | null;
  /** Deliveries per UTC day over the trailing window, oldest first. */
  daily: number[];
}

export function endpointDeliveryStats(deliveries: readonly HookDeliveryLike[], nowMs: number, days: number): Map<string, EndpointDeliveryStats> {
  const grouped = new Map<string, HookDeliveryLike[]>();
  for (const delivery of deliveries) {
    grouped.set(delivery.hook_endpoint_id, [...(grouped.get(delivery.hook_endpoint_id) ?? []), delivery]);
  }
  const result = new Map<string, EndpointDeliveryStats>();
  for (const [endpointId, list] of grouped) {
    result.set(endpointId, {
      total: list.length,
      pending: list.filter((delivery) => delivery.status === 'pending').length,
      lastReceivedAt: list.reduce<string | null>((latest, delivery) => (latest === null || delivery.received_at > latest ? delivery.received_at : latest), null),
      daily: dailyCountsFrom(
        list.map((delivery) => delivery.received_at),
        nowMs,
        days,
      ).map((bucket) => bucket.count),
    });
  }
  return result;
}

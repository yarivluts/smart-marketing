import type { SourcePluginExecutor, SourcePluginSyncParams, SourcePluginSyncResult } from './executor';

/** How many toy events one sync pass emits when the install's config doesn't override it. */
export const DEFAULT_TOY_COUNTER_BATCH_SIZE = 3;

const DEFAULT_TOY_COUNTER_EVENT_NAME = 'toy_counter_tick';

function readBatchSize(config: Record<string, unknown>): number {
  const value = config.batch_size;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_TOY_COUNTER_BATCH_SIZE;
}

function readEventName(config: Record<string, unknown>): string {
  const value = config.event_name;
  return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_TOY_COUNTER_EVENT_NAME;
}

/**
 * A deterministic, dependency-free {@link SourcePluginExecutor} — "a toy
 * source plugin syncs incrementally and survives restart" (plan `13 §E7.2`'s
 * literal AC), standing in for a real Shopify/Stripe/etc. connector until
 * KAN-49+ builds one against this runtime. Its own cursor is simply the
 * count of events emitted so far, encoded as a base-10 string: sync from
 * cursor `"6"` picks up at counter `6` and emits `batchSize` more, proving
 * cursor persistence "survives restart" without needing any real external
 * API to page through.
 */
export class ToyCounterSourcePluginExecutor implements SourcePluginExecutor {
  async sync(params: SourcePluginSyncParams): Promise<SourcePluginSyncResult> {
    const start = params.cursor === null ? 0 : Number.parseInt(params.cursor, 10);
    const batchSize = readBatchSize(params.config);
    const eventName = readEventName(params.config);
    const now = new Date().toISOString();

    const records = Array.from({ length: batchSize }, (_, offset) => {
      const counter = start + offset;
      return {
        event_id: `${params.pluginId}:${counter}`,
        event: eventName,
        ts: now,
        properties: { counter },
      };
    });

    return { kind: 'event', records, nextCursor: String(start + batchSize) };
  }
}

export const defaultSourcePluginExecutor: SourcePluginExecutor = new ToyCounterSourcePluginExecutor();

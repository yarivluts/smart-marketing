import { SourcePluginExecutionError, type SourcePluginExecutor, type SourcePluginSyncParams, type SourcePluginSyncResult } from '../executor';
import type { StripeApiClient, StripeListParams } from './api-client';
import { StripeApiError } from './api-client';
import { type StripeSyncCursor, type StripeResourceCursor, initialStripeSyncCursor, parseStripeSyncCursor, serializeStripeSyncCursor } from './cursor';
import { mapChargeToEventRecords, mapInvoiceToEventRecord, mapRefundToEventRecord, mapSubscriptionToEntityRecord } from './mappers';
import { STRIPE_SUBSCRIPTION_ENTITY_NAME } from './schemas';
import type { StripeListPage } from './types';

/** How many objects to fetch per resource, per `sync()` call — small enough that one "Run now"/scheduled invocation stays fast. */
export const DEFAULT_STRIPE_PAGE_SIZE = 100;

/**
 * One resource type's own page fetch + cursor advance. While backfill is
 * still in progress (`!backfillComplete`), pages through history via
 * `starting_after`; once caught up (`has_more: false` on some page), future
 * calls switch to `created[gte]` polling from the newest `created` this
 * resource has ever synced. The `created[gte]` boundary is inclusive by
 * design — a poll with nothing new simply re-fetches the same boundary
 * record(s), which `ingestBatch`'s own client-id dedup makes a harmless
 * no-op rather than a duplicate landing.
 */
async function syncOneResource<T extends { id: string; created: number }>(
  cursor: StripeResourceCursor,
  fetchPage: (params: StripeListParams) => Promise<StripeListPage<T>>,
  pageSize: number,
): Promise<{ items: T[]; cursor: StripeResourceCursor }> {
  const params: StripeListParams = cursor.backfillComplete
    ? { limit: pageSize, createdGte: cursor.lastSyncedCreated ?? 0 }
    : { limit: pageSize, startingAfter: cursor.backfillCursor ?? undefined };

  const page = await fetchPage(params);
  const items = page.data;

  if (items.length === 0) {
    return { items, cursor: { ...cursor, backfillComplete: true } };
  }

  const newestCreated = items.reduce((max, item) => Math.max(max, item.created), cursor.lastSyncedCreated ?? 0);

  if (cursor.backfillComplete) {
    return { items, cursor: { ...cursor, lastSyncedCreated: newestCreated } };
  }

  return {
    items,
    cursor: {
      backfillCursor: page.has_more ? items[items.length - 1].id : null,
      backfillComplete: !page.has_more,
      lastSyncedCreated: newestCreated,
    },
  };
}

async function runEventsPhase(
  client: StripeApiClient,
  cursor: StripeSyncCursor,
  pageSize: number,
): Promise<{ records: Record<string, unknown>[]; nextCursor: StripeSyncCursor }> {
  const [charges, invoices, refunds] = await Promise.all([
    syncOneResource(cursor.events.charge, (params) => client.listCharges(params), pageSize),
    syncOneResource(cursor.events.invoice, (params) => client.listInvoices(params), pageSize),
    syncOneResource(cursor.events.refund, (params) => client.listRefunds(params), pageSize),
  ]);

  const records = [
    ...charges.items.flatMap(mapChargeToEventRecords),
    ...invoices.items.map(mapInvoiceToEventRecord),
    ...refunds.items.map(mapRefundToEventRecord),
  ];

  return {
    records,
    nextCursor: {
      phase: 'entities',
      events: { charge: charges.cursor, invoice: invoices.cursor, refund: refunds.cursor },
      entities: cursor.entities,
    },
  };
}

async function runEntitiesPhase(
  client: StripeApiClient,
  cursor: StripeSyncCursor,
  pageSize: number,
): Promise<{ records: Record<string, unknown>[]; nextCursor: StripeSyncCursor }> {
  const subscriptions = await syncOneResource(cursor.entities.subscription, (params) => client.listSubscriptions(params), pageSize);

  return {
    records: subscriptions.items.map(mapSubscriptionToEntityRecord),
    nextCursor: {
      phase: 'events',
      events: cursor.events,
      entities: { subscription: subscriptions.cursor },
    },
  };
}

export interface StripeSourcePluginExecutorOptions {
  apiClient: StripeApiClient;
  /** Defaults to {@link DEFAULT_STRIPE_PAGE_SIZE} — overridable so tests can exercise multi-page backfill without huge fixtures. */
  pageSize?: number;
}

/**
 * The real Stripe source-plugin executor (KAN-49, plan `13 §E8.1`:
 * "backfill + webhooks ... -> commerce schemas incl. ... `mrr_normalized`").
 * `SourcePluginSyncResult` carries one homogeneous `kind` per call, so this
 * executor alternates between an `events` phase (charges/invoices/refunds,
 * each record naming its own event schema) and an `entities` phase
 * (subscriptions) on successive `sync()` calls — see `cursor.ts`'s own doc
 * comment for why. Each phase fetches one page per resource per call
 * (backfill via `starting_after`, then `created[gte]` polling once caught
 * up), so repeated "Run now"/scheduled invocations page through a whole
 * account's history exactly like `ToyCounterSourcePluginExecutor`'s counter
 * "survives restart" by resuming from the persisted cursor.
 */
export class StripeSourcePluginExecutor implements SourcePluginExecutor {
  private readonly apiClient: StripeApiClient;
  private readonly pageSize: number;

  constructor(options: StripeSourcePluginExecutorOptions) {
    this.apiClient = options.apiClient;
    this.pageSize = options.pageSize ?? DEFAULT_STRIPE_PAGE_SIZE;
  }

  async sync(params: SourcePluginSyncParams): Promise<SourcePluginSyncResult> {
    const cursor = params.cursor === null ? initialStripeSyncCursor() : parseStripeSyncCursor(params.cursor);

    try {
      if (cursor.phase === 'events') {
        const { records, nextCursor } = await runEventsPhase(this.apiClient, cursor, this.pageSize);
        return { kind: 'event', records, nextCursor: serializeStripeSyncCursor(nextCursor) };
      }

      const { records, nextCursor } = await runEntitiesPhase(this.apiClient, cursor, this.pageSize);
      return {
        kind: 'entity',
        entityType: STRIPE_SUBSCRIPTION_ENTITY_NAME,
        records,
        nextCursor: serializeStripeSyncCursor(nextCursor),
      };
    } catch (error) {
      if (error instanceof StripeApiError) {
        throw new SourcePluginExecutionError(error.message);
      }
      throw error;
    }
  }
}

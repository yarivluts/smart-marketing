import { describe, expect, it, vi } from 'vitest';
import type { StripeApiClient, StripeListParams } from './api-client';
import { StripeApiError } from './api-client';
import { StripeSourcePluginExecutor } from './executor';
import { SourcePluginExecutionError } from '../executor';
import type { PluginRuntimeCredential } from '../credential';
import { parseStripeSyncCursor } from './cursor';
import type { StripeCharge, StripeInvoice, StripeListPage, StripeRefund, StripeSubscription } from './types';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['ingest:write'],
};

const EMPTY_PAGE = { object: 'list' as const, data: [], has_more: false };

function charge(id: string, created: number, overrides: Partial<StripeCharge> = {}): StripeCharge {
  return {
    id,
    object: 'charge',
    amount: 1000,
    currency: 'usd',
    customer: 'cus_1',
    status: 'succeeded',
    refunded: false,
    amount_refunded: 0,
    created,
    ...overrides,
  };
}

function subscription(id: string, created: number): StripeSubscription {
  return {
    id,
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    currency: 'usd',
    current_period_end: created + 1000,
    cancel_at_period_end: false,
    canceled_at: null,
    created,
    items: { data: [{ price: { unit_amount: 2000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] },
  };
}

function baseClient(overrides: Partial<StripeApiClient> = {}): StripeApiClient {
  return {
    listCharges: vi.fn().mockResolvedValue(EMPTY_PAGE),
    listInvoices: vi.fn().mockResolvedValue(EMPTY_PAGE),
    listRefunds: vi.fn().mockResolvedValue(EMPTY_PAGE),
    listSubscriptions: vi.fn().mockResolvedValue(EMPTY_PAGE),
    ...overrides,
  };
}

function syncParams(cursor: string | null, client: StripeApiClient, pageSize?: number) {
  return { executor: new StripeSourcePluginExecutor({ apiClient: client, pageSize }), cursor };
}

describe('StripeSourcePluginExecutor', () => {
  it('runs the events phase first on a from-scratch sync (cursor null)', async () => {
    const client = baseClient({
      listCharges: vi.fn().mockResolvedValue({ object: 'list', data: [charge('ch_1', 1_700_000_000)], has_more: false }),
    });
    const { executor } = syncParams(null, client);
    const result = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.stripe', config: {}, credential: CREDENTIAL, cursor: null });

    expect(result.kind).toBe('event');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ event: 'stripe_charge' });
    expect(client.listSubscriptions).not.toHaveBeenCalled();
    expect(parseStripeSyncCursor(result.nextCursor).phase).toBe('entities');
  });

  it('alternates to the entities phase on the next call, using the persisted cursor', async () => {
    const client = baseClient({
      listSubscriptions: vi.fn().mockResolvedValue({ object: 'list', data: [subscription('sub_1', 1_700_000_000)], has_more: false }),
    });
    // First call (events phase, all empty) to get a cursor parked at "entities".
    const first = await new StripeSourcePluginExecutor({ apiClient: baseClient() }).sync({
      organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.stripe', config: {}, credential: CREDENTIAL, cursor: null,
    });

    const { executor } = syncParams(first.nextCursor, client);
    const second = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.stripe', config: {}, credential: CREDENTIAL, cursor: first.nextCursor });

    expect(second.kind).toBe('entity');
    expect(second.entityType).toBe('stripe_subscription');
    expect(second.records).toEqual([
      expect.objectContaining({ id: 'sub_1' }),
    ]);
    expect(parseStripeSyncCursor(second.nextCursor).phase).toBe('events');
  });

  it('combines charges, invoices, and refunds into one events-phase batch, each carrying its own event name', async () => {
    const client = baseClient({
      listCharges: vi.fn().mockResolvedValue({ object: 'list', data: [charge('ch_1', 1_700_000_000)], has_more: false }),
      listInvoices: vi
        .fn()
        .mockResolvedValue({ object: 'list', data: [{ id: 'in_1', object: 'invoice', customer: 'cus_1', subscription: null, status: 'paid', amount_due: 100, amount_paid: 100, currency: 'usd', created: 1_700_000_000 } satisfies StripeInvoice], has_more: false }),
      listRefunds: vi
        .fn()
        .mockResolvedValue({ object: 'list', data: [{ id: 're_1', object: 'refund', charge: 'ch_1', amount: 100, currency: 'usd', status: 'succeeded', reason: null, created: 1_700_000_000 } satisfies StripeRefund], has_more: false }),
    });
    const { executor } = syncParams(null, client);
    const result = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.stripe', config: {}, credential: CREDENTIAL, cursor: null });

    expect(result.records.map((r) => r.event)).toEqual(['stripe_charge', 'stripe_invoice', 'stripe_refund']);
  });

  it('emits both stripe_charge and stripe_failed_payment for a failed charge', async () => {
    const client = baseClient({
      listCharges: vi.fn().mockResolvedValue({ object: 'list', data: [charge('ch_1', 1_700_000_000, { status: 'failed' })], has_more: false }),
    });
    const { executor } = syncParams(null, client);
    const result = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.stripe', config: {}, credential: CREDENTIAL, cursor: null });

    expect(result.records.map((r) => r.event)).toEqual(['stripe_charge', 'stripe_failed_payment']);
  });

  it('pages through backfill via starting_after until has_more is false, then switches to created[gte] polling', async () => {
    const page1: StripeListPage<StripeCharge> = { object: 'list', data: [charge('ch_1', 100), charge('ch_2', 200)], has_more: true };
    const page2: StripeListPage<StripeCharge> = { object: 'list', data: [charge('ch_3', 300)], has_more: false };
    const listCharges = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2).mockResolvedValueOnce(EMPTY_PAGE);
    const client = baseClient({ listCharges });

    // Round 1: events phase, page 1 of charges.
    const executor = new StripeSourcePluginExecutor({ apiClient: client });
    const round1 = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null });
    expect(listCharges).toHaveBeenNthCalledWith(1, { limit: 100, startingAfter: undefined } satisfies StripeListParams);
    const cursor1 = parseStripeSyncCursor(round1.nextCursor);
    expect(cursor1.events.charge).toEqual({ backfillCursor: 'ch_2', backfillComplete: false, lastSyncedCreated: 200 });

    // Round 2: entities phase (empty), cursor comes back to events untouched for charges.
    const round2 = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: round1.nextCursor });

    // Round 3: events phase again, page 2 of charges — resumes from the persisted starting_after.
    const round3 = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: round2.nextCursor });
    expect(listCharges).toHaveBeenNthCalledWith(2, { limit: 100, startingAfter: 'ch_2' } satisfies StripeListParams);
    const cursor3 = parseStripeSyncCursor(round3.nextCursor);
    expect(cursor3.events.charge).toEqual({ backfillCursor: null, backfillComplete: true, lastSyncedCreated: 300 });

    // Round 4/round 5: back through entities, then events again — now polls with created[gte].
    const round4 = await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: round3.nextCursor });
    await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: round4.nextCursor });
    expect(listCharges).toHaveBeenNthCalledWith(3, { limit: 100, createdGte: 300 } satisfies StripeListParams);
  });

  it('honors a configured pageSize', async () => {
    const listCharges = vi.fn().mockResolvedValue(EMPTY_PAGE);
    const client = baseClient({ listCharges });
    const { executor } = syncParams(null, client, 25);
    await executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null });
    expect(listCharges).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it('wraps a StripeApiError as SourcePluginExecutionError so the generic retry/backoff loop can act on it', async () => {
    const client = baseClient({ listCharges: vi.fn().mockRejectedValue(new StripeApiError('rate limited', 429)) });
    const { executor } = syncParams(null, client);
    await expect(
      executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: null }),
    ).rejects.toBeInstanceOf(SourcePluginExecutionError);
  });

  it('rejects a malformed persisted cursor rather than silently starting over', async () => {
    const { executor } = syncParams('not-json', baseClient());
    await expect(
      executor.sync({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'p', config: {}, credential: CREDENTIAL, cursor: 'not-json' }),
    ).rejects.toThrow();
  });
});

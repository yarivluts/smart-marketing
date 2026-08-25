import { PipelineMessageModel } from '../models/pipeline-message.model';
import { ProjectModel } from '../models/project.model';
import { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefKind } from '../models/schema-def.model';
import { publishPipelineMessage } from '../pipeline/transport';
import { defaultWarehouseSink, type WarehouseSink } from '../pipeline/sink';
import {
  STRIPE_CHARGE_EVENT_NAME,
  STRIPE_FAILED_PAYMENT_EVENT_NAME,
  STRIPE_REFUND_EVENT_NAME,
  STRIPE_SUBSCRIPTION_ENTITY_NAME,
} from '../plugin-runtime/stripe/schemas';
import { recordAuditLogEntry } from './audit-log.service';
import { ProjectNotFoundError } from './resource-library.service';

/** Same "404-not-403, real project + wrong org indistinguishable from nonexistent" check every other project-scoped service uses — see `orchestration.service.ts`'s own copy for the KAN-26 reasoning. */
async function requireProjectInOrg(organizationId: string, projectId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
}

/** Bounds one `drainPendingPipelineMessages` call — same load-bounding reasoning as `MAX_INGEST_BATCH_SIZE`. */
export const MAX_PIPELINE_DRAIN_BATCH_SIZE = 500;

export interface AcceptedPipelineRecord {
  clientId: string;
  schemaName: string;
  payload: Record<string, unknown>;
}

export interface EnqueueAcceptedRecordsParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  kind: SchemaDefKind;
  records: readonly AcceptedPipelineRecord[];
}

/**
 * Publishes every accepted ingest record to the pipeline (KAN-33). Each record is published
 * independently (`Promise.allSettled`, not a single `Promise.all`): a record whose own publish fails
 * is simply omitted from the returned array — it was never durably queued, so there's nothing to
 * land for it — without blocking its batch-mates from being queued, the same per-record failure
 * isolation as the dedup-key-claim writes just above this call in `ingestBatch`.
 */
export async function enqueueAcceptedRecordsForPipeline(
  params: EnqueueAcceptedRecordsParams,
): Promise<PipelineMessageModel[]> {
  const results = await Promise.allSettled(
    params.records.map((record) =>
      publishPipelineMessage({
        organizationId: params.organizationId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        batchId: params.batchId,
        kind: params.kind,
        schemaName: record.schemaName,
        clientId: record.clientId,
        payload: record.payload,
      }),
    ),
  );
  return results
    .filter((result): result is PromiseFulfilledResult<PipelineMessageModel> => result.status === 'fulfilled')
    .map((result) => result.value);
}

async function landMessage(message: PipelineMessageModel, sink: WarehouseSink): Promise<void> {
  try {
    await sink.insertRawRecord(
      {
        organizationId: message.organization_id,
        projectId: message.project_id,
        environmentId: message.environment_id,
        batchId: message.batch_id,
        kind: message.kind,
        schemaName: message.schema_name,
        clientId: message.client_id,
        payload: message.payload,
      },
      message.id,
    );
    message.status = 'delivered';
    message.delivered_at = new Date().toISOString();
  } catch (error) {
    message.status = 'failed';
    message.failure_reason = error instanceof Error ? error.message : String(error);
  }
  try {
    await message.save();
  } catch {
    // Best-effort status update: if this write itself fails, the message is left `queued` in
    // Firestore even though it may already have landed — a later drain will simply try to land it
    // again, which is safe since landing is idempotent (keyed by this message's own id). Not caught
    // by the caller: a failure here must never abort landing the *other* messages in the same call.
  }
}

export interface DrainPipelineResult {
  delivered: number;
  failed: number;
}

/** Lands every given message in parallel — each is an independent write — and tallies the outcome. */
async function landMessages(messages: readonly PipelineMessageModel[], sink: WarehouseSink): Promise<DrainPipelineResult> {
  await Promise.all(messages.map((message) => landMessage(message, sink)));
  let delivered = 0;
  let failed = 0;
  for (const message of messages) {
    if (message.status === 'delivered') {
      delivered += 1;
    } else {
      failed += 1;
    }
  }
  return { delivered, failed };
}

export interface LandPipelineMessagesParams {
  sink?: WarehouseSink;
}

/**
 * The "Pub/Sub subscriber -> BigQuery insert" hop for a specific, already-known set of messages
 * (KAN-33 AC: "event visible in BQ < 60s after 202"). `ingestBatch` calls this with exactly the
 * messages it just published (see `enqueueAcceptedRecordsForPipeline`) — scoped to its own batch, not
 * the environment's whole backlog — so concurrent `ingestBatch` calls never race over the same
 * messages or pay for landing each other's records. A message whose landing throws is marked `failed`
 * rather than aborting the rest of the call; retrying/replaying a `failed` message is KAN-34's DLQ,
 * not this story's.
 */
export async function landPipelineMessages(
  messages: readonly PipelineMessageModel[],
  params: LandPipelineMessagesParams = {},
): Promise<DrainPipelineResult> {
  return landMessages(messages, params.sink ?? defaultWarehouseSink);
}

export interface DrainPipelineParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  limit?: number;
  sink?: WarehouseSink;
}

/**
 * A general-purpose catch-up sweep over anything still `queued` for one org/project/environment,
 * oldest first, capped at `limit` — for a future scheduled worker (KAN-38) or ops use, not called
 * from `ingestBatch` itself (that uses `landPipelineMessages` above, scoped to its own batch). Two
 * overlapping calls here can both fetch and land the same still-`queued` message before either has
 * updated it (no claim step) — wasted double work, not a correctness bug (landing is idempotent by
 * message id) — a gap acceptable for an occasional catch-up sweep but not for the hot ingest path.
 *
 * Ordering ("oldest first") is best-effort, not strict: messages published concurrently (as
 * `enqueueAcceptedRecordsForPipeline` does within one batch) can share a millisecond-resolution
 * `enqueued_at`, and nothing today depends on strict FIFO order across records.
 *
 * Would need a composite Firestore index (`environment_id`, `status`, `enqueued_at`) in a real
 * (non-emulator) project — the emulator this package's own tests run against doesn't enforce that.
 */
export async function drainPendingPipelineMessages(params: DrainPipelineParams): Promise<DrainPipelineResult> {
  const limit = Math.min(params.limit ?? MAX_PIPELINE_DRAIN_BATCH_SIZE, MAX_PIPELINE_DRAIN_BATCH_SIZE);

  const pending = await PipelineMessageModel.initPath({
    organization_id: params.organizationId,
    project_id: params.projectId,
  })
    .where('environment_id', '==', params.environmentId)
    .where('status', '==', 'queued')
    .orderBy('enqueued_at')
    .limit(limit)
    .get();

  return landMessages(pending as PipelineMessageModel[], params.sink ?? defaultWarehouseSink);
}

/** Every raw record landed for one batch — used by tests to verify the "visible in BQ" AC, and a building block a future KAN-35 ingest-health admin surface could reuse. */
export async function listRawRecordsForBatch(
  organizationId: string,
  projectId: string,
  batchId: string,
): Promise<RawRecordModel[]> {
  return RawRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('batch_id', '==', batchId)
    .get();
}

/**
 * The single most recently landed raw record for one schema, scoped to one
 * environment (KAN-36's "has this event ever flowed, and if so when did we
 * last see it" building block). Scoping matters: a project's environments
 * carry independent traffic (a `dev` key firing test events must never mask
 * `prod` going silent, or vice versa), so this deliberately does not fold
 * every environment into one project-wide answer. No lower bound on
 * `landed_at` — this deliberately looks arbitrarily far back so a genuinely
 * silent event is still found, not just missed because it fell outside some
 * recent window. Three equality filters (`environment_id`, `kind`,
 * `schema_name`) plus an `orderBy` on a fourth (`landed_at`) needs a
 * composite index in real (non-emulator) Firestore, the same documented
 * requirement `drainPendingPipelineMessages`'s own query already carries.
 */
export async function getMostRecentRawRecordForSchema(
  organizationId: string,
  projectId: string,
  environmentId: string,
  kind: SchemaDefKind,
  schemaName: string,
): Promise<RawRecordModel | null> {
  const matches = await RawRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('environment_id', '==', environmentId)
    .where('kind', '==', kind)
    .where('schema_name', '==', schemaName)
    .orderBy('landed_at', 'desc')
    .limit(1)
    .get();
  return matches[0] ?? null;
}

/**
 * Every raw record landed for one schema in one environment since a given
 * timestamp, newest first, bounded to `limit` — the per-event volume/
 * sparkline building block (KAN-36). Scoped to one environment for the same
 * reason {@link getMostRecentRawRecordForSchema} is. Newest-first (not
 * oldest-first) so that a schema landing more than `limit` records within
 * the window still gets truncated to its most recent ones — the ones a
 * sparkline and a "last seen" reading actually care about — rather than
 * silently keeping the stalest end of the window and making a busy, healthy
 * event look quiet. Same composite-index caveat as
 * {@link getMostRecentRawRecordForSchema}; the range filter shares
 * `orderBy`'s own field (`landed_at`), so only the three equality prefixes
 * (`environment_id`, `kind`, `schema_name`) need it.
 */
export async function listRawRecordsForSchemaSince(
  organizationId: string,
  projectId: string,
  environmentId: string,
  kind: SchemaDefKind,
  schemaName: string,
  sinceIso: string,
  limit: number,
): Promise<RawRecordModel[]> {
  return RawRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('environment_id', '==', environmentId)
    .where('kind', '==', kind)
    .where('schema_name', '==', schemaName)
    .where('landed_at', '>=', sinceIso)
    .orderBy('landed_at', 'desc')
    .limit(limit)
    .get();
}

/**
 * The event schema names surfaced by the billing-ops feed (KAN-80, gap-analysis Gap 5+15: "new
 * charges / failed charges / refunds as a browsable record feed"). Currently only Stripe's (KAN-49);
 * a future second billing connector adds its event names to this one list rather than growing a
 * parallel feed. Deliberately excludes `stripe_invoice` (a billing-cycle record, not itself an
 * actionable charge/failure/refund event) and the `stripe_subscription` entity (current-state, not an
 * append-only event this feed's "most recent N" framing fits — see the churn feed below instead).
 */
export const BILLING_OPS_FEED_EVENT_SCHEMA_NAMES = [
  STRIPE_CHARGE_EVENT_NAME,
  STRIPE_FAILED_PAYMENT_EVENT_NAME,
  STRIPE_REFUND_EVENT_NAME,
] as const;

/** Same load-bounding reasoning as `DEFAULT_INGEST_HEALTH_BATCH_LIMIT` — this is a Firestore-backed stand-in until a real warehouse query exists. */
export const DEFAULT_BILLING_OPS_FEED_LIMIT = 100;

/** Same load-bounding default as {@link DEFAULT_BILLING_OPS_FEED_LIMIT} — kept as its own named constant since a generic record feed (KAN-81) isn't billing-specific. */
export const DEFAULT_RECORD_FEED_LIMIT = 100;

/** One equality filter on a raw record's own declared field (its schema's `field_defs` entry, not a raw envelope key — see `declaredFieldsForRecord`) — the record-feed page's "filterable" half of Gap 5 (today only a schema picker exists). Exact match, compared as a string (see `stringifyPayloadFieldValue`). */
export interface RecordFieldFilter {
  fieldName: string;
  value: string;
}

export interface ListRecentRecordsForSchemasParams {
  organizationId: string;
  projectId: string;
  kind: SchemaDefKind;
  /** One or more registered schema names of the same `kind` to fold into one feed — e.g. every billing event schema, every churn-signal entity schema, or just the one schema a record-feed page's picker selected. */
  schemaNames: readonly string[];
  limit?: number;
  /** Restricts the feed to records whose declared `fieldName` value stringifies to exactly `value`. See `RECORD_FIELD_FILTER_CANDIDATE_WINDOW` for how this is applied. */
  fieldFilter?: RecordFieldFilter;
}

/** Same "over-fetch a candidate window, then filter" posture as `CHURN_FEED_CANDIDATE_WINDOW` — Firestore has no native way to filter on an arbitrary `payload` field server-side without a dedicated per-field index, so a `fieldFilter` widens the per-schema fetch to this many candidates (newest first) before filtering, rather than filtering only within `limit`'s own narrow window. A project with more than this many records landed more recently than its oldest unscanned match would miss that match — the same known, documented limitation every other Firestore-backed feed in this file already carries. */
const RECORD_FIELD_FILTER_CANDIDATE_WINDOW = 500;

/** Same stringification convention `record-feed-view.ts`'s `stringifyPayloadValue` renders with, kept as its own copy here since filter-matching (server-side, never rendered) and PII-redacted display (client-facing) are different concerns that happen to share a shape. */
function stringifyPayloadFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * The declared-fields sub-object within a raw record's own envelope, keyed by `kind` — a landed
 * `RawRecordModel.payload` is the *whole* envelope as submitted (an event's own `event_id`/`event`/
 * `ts` alongside its `properties`, an entity's `id` alongside its `attributes`, a measure's `measure`/
 * `ts`/`value` alongside its `dimensions`), not a flat map of the schema's declared fields — same
 * dispatch `ingest.service.ts`'s `checkRecordEnvelope` uses for validation. Duplicated here (not
 * imported) since `ingest.service.ts` already imports from this file — importing back would create a
 * cycle.
 */
function declaredFieldsForRecord(record: RawRecordModel): Record<string, unknown> {
  const key = record.kind === 'entity' ? 'attributes' : record.kind === 'measure' ? 'dimensions' : 'properties';
  const value = record.payload[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function matchesFieldFilter(record: RawRecordModel, filter: RecordFieldFilter): boolean {
  return stringifyPayloadFieldValue(declaredFieldsForRecord(record)[filter.fieldName]) === filter.value;
}

/**
 * The most recent raw records landed for one or more schemas of the same `kind` in a project, newest
 * first, folded across every environment — same "whole project, one admin view" posture as
 * `listRecentIngestBatchesForProject`. One bounded query per schema name (Firestore has no native
 * "kind == X AND schema_name IN [...]" + orderBy composite this ORM exposes), merged and re-sorted
 * client-side, then (optionally field-filtered and) trimmed to `limit` — so a burst in one schema can't
 * silently starve the merged feed of another's more recent records purely by fetch order. Each
 * per-schema fetch needs a composite Firestore index (`kind`, `schema_name`, `landed_at`) in a real
 * (non-emulator) project, same documented requirement every other `RawRecordModel` query in this file
 * already carries. The general-purpose building block behind `listRecentBillingEventsForProject`
 * (KAN-80, a fixed Stripe schema set), `listRecentChurnedSubscriptionsForProject` (KAN-81, a fixed
 * entity schema set), and the KAN-81 record-feed page (a human-picked single schema, optionally
 * field-filtered).
 */
export async function listRecentRecordsForSchemas(params: ListRecentRecordsForSchemasParams): Promise<RawRecordModel[]> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const limit = params.limit ?? DEFAULT_RECORD_FEED_LIMIT;
  const fetchLimit = params.fieldFilter ? Math.max(limit, RECORD_FIELD_FILTER_CANDIDATE_WINDOW) : limit;

  const perSchemaResults = await Promise.all(
    params.schemaNames.map((schemaName) =>
      RawRecordModel.initPath({ organization_id: params.organizationId, project_id: params.projectId })
        .where('kind', '==', params.kind)
        .where('schema_name', '==', schemaName)
        .orderBy('landed_at', 'desc')
        .limit(fetchLimit)
        .get(),
    ),
  );

  const merged = perSchemaResults
    .flat()
    .sort((a, b) => (a.landed_at < b.landed_at ? 1 : a.landed_at > b.landed_at ? -1 : 0));

  const filtered = params.fieldFilter ? merged.filter((record) => matchesFieldFilter(record, params.fieldFilter!)) : merged;

  return filtered.slice(0, limit);
}

/**
 * The most recent billing events (charges, failed payments, refunds) landed for a project — the
 * `BILLING_OPS_FEED_EVENT_SCHEMA_NAMES`-scoped specialization of {@link listRecentRecordsForSchemas}.
 */
export async function listRecentBillingEventsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_BILLING_OPS_FEED_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({ organizationId, projectId, kind: 'event', schemaNames: BILLING_OPS_FEED_EVENT_SCHEMA_NAMES, limit });
}

/**
 * The entity schema name(s) surfaced by the churn feed (KAN-81, generalizing KAN-80's billing-ops
 * feed pattern to plan `14 §Gap 5`'s "live record feeds ... churn"). Currently only Stripe's
 * subscription entity; a future second billing connector adds its entity name here rather than
 * growing a parallel feed.
 */
export const CHURN_FEED_ENTITY_SCHEMA_NAMES = [STRIPE_SUBSCRIPTION_ENTITY_NAME] as const;

/** Same load-bounding reasoning as `DEFAULT_BILLING_OPS_FEED_LIMIT`. */
export const DEFAULT_CHURN_FEED_LIMIT = 100;

/**
 * How many of the most recently landed `stripe_subscription` entity records to scan for a churn
 * signal before giving up. Unlike the billing-ops feed's `event`-kind records (each one already an
 * actionable charge/failure/refund), a subscription `entity` record is a current-state snapshot
 * re-landed on every update — no dedicated append-only "subscription canceled" event schema exists to
 * query directly (see `STRIPE_COMMERCE_SCHEMAS`) — so most of a naively-fetched recent window are
 * healthy, unrelated renewals. Scanning a wider candidate window than the feed's own `limit` before
 * filtering keeps a quiet cancellation from being starved out by a burst of unrelated subscription
 * updates. Same fixed load-bounding posture as `MAX_PIPELINE_DRAIN_BATCH_SIZE`; a project with more
 * than this many subscription updates landed more recently than its oldest unscanned churn signal
 * would miss that signal — a known, documented limitation of this Firestore-backed stand-in, same
 * posture every other "buildable today" feed in this file already carries.
 */
const CHURN_FEED_CANDIDATE_WINDOW = 500;

/**
 * A subscription entity record counts as a churn signal once it's canceled or scheduled to cancel —
 * mirrors the `mrr_movements` "downgrade" slice `CHURNED_MRR` (`saas-metric-pack/metrics.ts`) uses at
 * the warehouse layer, at the raw-record level. Reads through `declaredFieldsForRecord` (not
 * `record.payload` directly) for the same reason `record-feed-view.ts`'s `toRecordFeedEntryView` fix
 * (KAN-81 slice 6, PR #247) had to: a landed `RawRecordModel.payload` is the whole ingest envelope, so
 * an entity's declared fields (incl. `cancel_at_period_end`/`canceled_at`) live under `payload.attributes`,
 * not at the payload's top level — reading `payload` directly silently never matched a real Stripe-landed
 * subscription, only a hand-built flat-payload test fixture.
 */
function isChurnSignal(record: RawRecordModel): boolean {
  const fields = declaredFieldsForRecord(record);
  return fields.cancel_at_period_end === true || typeof fields.canceled_at === 'string';
}

/**
 * The most recently landed Stripe subscriptions showing a churn signal — already canceled
 * (`canceled_at` set) or scheduled to cancel at the end of the current billing period
 * (`cancel_at_period_end`) — newest first, folded across every environment (KAN-81). See
 * `CHURN_FEED_CANDIDATE_WINDOW` for why this over-fetches before filtering.
 */
export async function listRecentChurnedSubscriptionsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_CHURN_FEED_LIMIT,
): Promise<RawRecordModel[]> {
  const candidates = await listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: 'entity',
    schemaNames: CHURN_FEED_ENTITY_SCHEMA_NAMES,
    limit: Math.max(limit, CHURN_FEED_CANDIDATE_WINDOW),
  });

  return candidates.filter((record) => isChurnSignal(record)).slice(0, limit);
}

/**
 * Every message still `queued` across a whole project (every environment folded together) — the
 * project-wide admin-visibility counterpart to `drainPendingPipelineMessages`'s single-environment
 * sweep, same "fold every environment into one admin view" posture as
 * `listFailedPipelineMessagesForProject`/`listRecentIngestBatchesForProject`. A message normally only
 * sits `queued` for the instant between publish and land (`ingestBatch` lands its own batch
 * synchronously), so anything showing up here has been stuck — e.g. the process crashed between
 * publish and land — and never got a `delivered`/`failed` terminal status. Oldest first, so the
 * longest-stuck messages are the ones an operator sees first.
 */
export async function listQueuedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit: number = MAX_PIPELINE_DRAIN_BATCH_SIZE,
): Promise<PipelineMessageModel[]> {
  return PipelineMessageModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('status', '==', 'queued')
    .orderBy('enqueued_at')
    .limit(Math.min(limit, MAX_PIPELINE_DRAIN_BATCH_SIZE))
    .get();
}

/**
 * Manually sweeps every message still stuck `queued` across a whole project (every environment),
 * landing each one — the project-wide, admin-triggerable counterpart to
 * `drainPendingPipelineMessages`'s single-environment sweep, same "ops use, not on the hot ingest
 * path" posture that function's own doc comment already establishes. Reuses `landMessages` directly
 * (not `drainPendingPipelineMessages` per environment) so one call sweeps the whole project in a
 * single pass rather than requiring a caller to already know every environment id.
 */
export async function sweepQueuedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit: number = MAX_PIPELINE_DRAIN_BATCH_SIZE,
  sink?: WarehouseSink,
  performedByUserId?: string,
): Promise<DrainPipelineResult> {
  await requireProjectInOrg(organizationId, projectId);
  const queued = await listQueuedPipelineMessagesForProject(organizationId, projectId, limit);
  const result = await landMessages(queued, sink ?? defaultWarehouseSink);

  if (performedByUserId) {
    try {
      await recordAuditLogEntry({
        organizationId,
        projectId,
        actorType: 'user',
        actorId: performedByUserId,
        action: 'pipeline_message.sweep',
        targetType: 'project',
        targetId: projectId,
        summary: `Swept ${queued.length} stuck queued pipeline message(s): ${result.delivered} delivered, ${result.failed} failed`,
        after: { attempted: queued.length, delivered: result.delivered, failed: result.failed },
      });
    } catch {
      // Best-effort — see the comment on `recordAuditLogEntry`.
    }
  }

  return result;
}

/**
 * The pipeline's dead-letter queue (KAN-34): every message a `landMessage` attempt has given up on,
 * across every environment in a project — same "fold every environment into one admin view" posture as
 * `listRecentIngestBatchesForProject`/`listApiKeysForProject`. Newest first.
 */
export async function listFailedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit: number = MAX_PIPELINE_DRAIN_BATCH_SIZE,
): Promise<PipelineMessageModel[]> {
  return PipelineMessageModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('status', '==', 'failed')
    .orderBy('enqueued_at', 'desc')
    .limit(Math.min(limit, MAX_PIPELINE_DRAIN_BATCH_SIZE))
    .get();
}

/**
 * Retries every currently-failed pipeline message in a project (KAN-34 AC: DLQ + replay) — re-runs the
 * exact same landing attempt `landPipelineMessages` made originally. A message that fails again simply
 * stays `failed` with its `failure_reason` refreshed, available for a later replay; nothing here is
 * lost or dropped on a repeat failure.
 */
export async function replayFailedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit: number = MAX_PIPELINE_DRAIN_BATCH_SIZE,
  sink?: WarehouseSink,
  performedByUserId?: string,
): Promise<DrainPipelineResult> {
  await requireProjectInOrg(organizationId, projectId);
  const failed = await listFailedPipelineMessagesForProject(organizationId, projectId, limit);
  const result = await landMessages(failed, sink ?? defaultWarehouseSink);

  if (performedByUserId) {
    try {
      await recordAuditLogEntry({
        organizationId,
        projectId,
        actorType: 'user',
        actorId: performedByUserId,
        action: 'pipeline_message.replay',
        targetType: 'project',
        targetId: projectId,
        summary: `Retried ${failed.length} failed pipeline message(s): ${result.delivered} delivered, ${result.failed} still failing`,
        after: { attempted: failed.length, delivered: result.delivered, failed: result.failed },
      });
    } catch {
      // Best-effort — see the comment on `recordAuditLogEntry`.
    }
  }

  return result;
}

import { createHash } from 'node:crypto';
import {
  IngestBatchModel,
  type IngestRecordResult,
  type IngestRecordStatus,
} from '../models/ingest-batch.model';
import { IngestDedupKeyModel } from '../models/ingest-dedup-key.model';
import { QuarantinedRecordModel } from '../models/quarantined-record.model';
import type { SchemaDefKind, SchemaFieldDef, SchemaFieldType } from '../models/schema-def.model';
import { getActiveSchemaDefinition, IMPLICIT_EVENT_ENVELOPE_FIELDS } from './schema-registry.service';
import { enqueueAcceptedRecordsForPipeline, landPipelineMessages } from './pipeline.service';
import { evaluateRecordAgainstWinRules } from './win-rule.service';

export class EmptyIngestBatchError extends Error {
  constructor() {
    super('A batch must contain at least one record.');
    this.name = 'EmptyIngestBatchError';
  }
}

/** Load-test AC (`13 §E3.2`: "1k events/s sustained") bounds how much one HTTP call may attempt synchronously — a client sending more should split into multiple batches. */
export const MAX_INGEST_BATCH_SIZE = 1000;

export class IngestBatchTooLargeError extends Error {
  constructor(public readonly maxSize: number) {
    super(`A batch may not contain more than ${maxSize} records.`);
    this.name = 'IngestBatchTooLargeError';
  }
}

/**
 * The three ingest shapes (plan `08 §2`). `records` is deliberately untyped
 * beyond `unknown` at this layer — `prepareRecord` below validates each
 * record's own envelope defensively regardless of what a caller actually
 * sent, the same "quarantine, don't crash" posture the schema-validation
 * step itself takes for unknown/malformed fields.
 */
export type IngestBatchInput =
  | { kind: 'event'; records: readonly unknown[] }
  | { kind: 'entity'; type: string; records: readonly unknown[] }
  | { kind: 'measure'; records: readonly unknown[] };

export interface IngestBatchParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  input: IngestBatchInput;
}

export interface IngestBatchSummary {
  batchId: string;
  kind: SchemaDefKind;
  total: number;
  accepted: number;
  quarantined: number;
  duplicates: number;
  /**
   * The records that were NOT accepted, with the reason each was rejected.
   *
   * The counts alone cannot be acted on: "quarantined: 1" tells a sender that something was
   * wrong without saying what, and the per-record reasons were already computed here and then
   * dropped on the way out - they were readable only by a second call to
   * `GET /v1/ingest/batches/{id}`, which nothing in the response points at. So the common
   * failure was a caller POSTing, reading a 202, and never learning that an unregistered event
   * name or one stray property had rejected the whole batch.
   *
   * Only the rejected records, not every record: a fully accepted batch adds nothing to the
   * response, and the payload stays proportional to what went wrong rather than to batch size.
   */
  rejected: IngestRecordResult[];
}

interface PreparedRecord {
  clientId: string;
  schemaName: string;
  fieldsToValidate: Record<string, unknown>;
  envelopeReasons: string[];
  /** The whole raw record as submitted (not just `fieldsToValidate`) — an accepted record's pipeline/warehouse payload (KAN-33) is the full envelope, e.g. an event's `event_id`/`ts` alongside its `properties`. */
  raw: Record<string, unknown>;
  /** Entities only: {@link entityContentHash} of this version's attributes. */
  contentHash?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A non-empty string once trimmed, or `undefined` — the one check every envelope field below needs, so a whitespace-only value is treated the same as a missing one everywhere (both the "is it present" check and the fallback-id decision agree). */
function requireNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export interface RecordEnvelopeCheck {
  /** The field map to validate against the schema — an event's `properties`, an entity's `attributes`, a measure's `dimensions`. */
  fieldsToValidate: Record<string, unknown>;
  envelopeReasons: string[];
}

/**
 * The envelope-level checks (required top-level fields like an event's `event_id`/`event`/`ts`) a raw
 * record must pass before its `fieldsToValidate` are even checked against a schema. Factored out of
 * `prepareRecord` so `quarantine.service.ts`'s replay path — which already knows a stored quarantined
 * record's `kind` from `QuarantinedRecordModel`, not a fresh `IngestBatchInput` — can re-run exactly the
 * same envelope logic against the persisted raw payload without re-deriving `clientId`/`schemaName`.
 */
export function checkRecordEnvelope(kind: SchemaDefKind, raw: Record<string, unknown>): RecordEnvelopeCheck {
  if (kind === 'event') {
    const reasons: string[] = [];
    if (!requireNonEmptyString(raw.event_id)) reasons.push('missing_field:event_id');
    if (!requireNonEmptyString(raw.event)) reasons.push('missing_field:event');
    if (!requireNonEmptyString(raw.ts)) reasons.push('missing_field:ts');
    return { fieldsToValidate: asRecord(raw.properties), envelopeReasons: reasons };
  }

  if (kind === 'entity') {
    const reasons: string[] = [];
    if (!requireNonEmptyString(raw.id)) reasons.push('missing_field:id');
    return { fieldsToValidate: asRecord(raw.attributes), envelopeReasons: reasons };
  }

  const reasons: string[] = [];
  if (!requireNonEmptyString(raw.measure)) reasons.push('missing_field:measure');
  if (!requireNonEmptyString(raw.ts)) reasons.push('missing_field:ts');
  if (typeof raw.value !== 'number' || Number.isNaN(raw.value)) reasons.push('missing_field:value');
  return { fieldsToValidate: asRecord(raw.dimensions), envelopeReasons: reasons };
}

/** Canonical JSON: keys sorted at every nesting level (not just the top one), so two dimension payloads that differ only in key order hash identically for measure dedup below. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

function sortedJson(record: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(record));
}

/**
 * A stable hash of an entity record's attributes, used to tell an identical resend of an entity
 * (a retried batch, a no-op) from a new version of it (an upsert that must land). Exported so the
 * quarantine replay path compares versions the same way ingest does.
 */
export function entityContentHash(fieldsToValidate: Record<string, unknown>): string {
  return createHash('sha256').update(sortedJson(fieldsToValidate)).digest('hex');
}

/**
 * Whether an incoming record repeats one an earlier batch already accepted (B13, 2026-09-25).
 *
 * For events and measures the dedup key IS the record's identity, so any existing claim means a
 * repeat. An entity is different: its id names a row, and each upsert is a new version of that row
 * ("upsert replaces the whole row, latest wins" - `entities.sql` keeps the latest by `landed_at`).
 * Deduping entities on the id alone meant the first version won forever: every later upsert - a
 * plan upgrade, a deactivation - was silently counted as a duplicate and dropped, and Customer 360
 * froze at signup. So an entity repeats only when it matches the LATEST accepted version's content.
 * Comparing with the latest (not with every version ever seen) is what lets a change back to an
 * earlier value (free -> pro -> free) land too.
 */
export function isDuplicateOfClaim(
  kind: SchemaDefKind,
  claim: Pick<IngestDedupKeyModel, 'content_hash'> | null | undefined,
  contentHash: string | undefined,
): boolean {
  if (!claim) {
    return false;
  }
  if (kind !== 'entity') {
    return true;
  }
  return claim.content_hash !== undefined && claim.content_hash === contentHash;
}

/**
 * Turns one raw record into its client-facing id, the schema family it
 * should validate against, and the field map to check — per plan `12
 * §2.1`/`§2.2`'s three sketches: an event's schema name is its own `event`
 * field; an entity batch's schema name is the batch-level `type`; a measure's
 * schema name is its own `measure` field. Envelope validation itself is
 * shared with the replay path via {@link checkRecordEnvelope}.
 */
function prepareRecord(input: IngestBatchInput, record: unknown, index: number): PreparedRecord {
  const r = asRecord(record);
  const { fieldsToValidate, envelopeReasons } = checkRecordEnvelope(input.kind, r);

  if (input.kind === 'event') {
    const eventId = requireNonEmptyString(r.event_id);
    const eventName = requireNonEmptyString(r.event);
    return {
      clientId: eventId ?? `event#${index}`,
      schemaName: eventName ?? '',
      fieldsToValidate,
      envelopeReasons,
      raw: r,
    };
  }

  if (input.kind === 'entity') {
    const id = requireNonEmptyString(r.id);
    return {
      clientId: id ?? `entity#${index}`,
      schemaName: input.type,
      fieldsToValidate,
      envelopeReasons,
      raw: r,
      contentHash: entityContentHash(fieldsToValidate),
    };
  }

  const measureName = requireNonEmptyString(r.measure);
  const ts = requireNonEmptyString(r.ts);
  return {
    // Measures carry no client-supplied id in the plan's sketch, so their
    // own natural key (name+ts+dimensions) stands in — re-sending the same
    // aggregate is then idempotent the same way a real client id would make it.
    clientId: measureName && ts ? `${measureName}|${ts}|${sortedJson(fieldsToValidate)}` : `measure#${index}`,
    schemaName: measureName ?? '',
    fieldsToValidate,
    envelopeReasons,
    raw: r,
  };
}

const FIELD_TYPE_VALIDATORS: Record<SchemaFieldType, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && !Number.isNaN(value),
  boolean: (value) => typeof value === 'boolean',
  timestamp: (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)),
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  array: (value) => Array.isArray(value),
};

/**
 * The identity-envelope properties the platform's own tracking snippet
 * (KAN-57's `buildTrackedEvent`) attaches to EVERY event it fires —
 * `anon_id` always, `customer_id` once `identify()` has run. Implicitly
 * allowed (as strings) on every event schema: without this, any event
 * schema that didn't explicitly re-declare them quarantined 100% of real
 * traffic from the platform's own snippet with `unregistered_field:anon_id`
 * — found by session-B QA the first time a snippet-shaped event met a
 * hand-registered schema (2026-08-19). Implicit acceptance only affects
 * ingest validation; a project that wants either field to participate in
 * identity stitching (KAN-56) still declares it explicitly with
 * `is_identity_key`, same as before.
 */
// Defined in `schema-registry.service.ts` so registration can reject these names
// without an import cycle (this module already imports from that one). Re-exported
// here because this is where callers expect to find it.
export { IMPLICIT_EVENT_ENVELOPE_FIELDS } from './schema-registry.service';

/**
 * Reject-list validation against a schema's registered fields: every required field must be present
 * and correctly typed; any field not declared on the schema is quarantined rather than silently
 * dropped (plan `08 §2`). Exported so `quarantine.service.ts`'s replay path can re-run the identical
 * check against the current (possibly since-evolved) active schema, rather than duplicating it.
 * `kind` gates {@link IMPLICIT_EVENT_ENVELOPE_FIELDS} — only `event` records carry snippet-attached
 * identity properties; entity/measure validation is unchanged. It is REQUIRED rather than optional
 * on purpose: omitting it silently empties that implicit list, so an event's envelope identity
 * properties would come back as `unregistered_field` and quarantine the record. Every record being
 * validated has a kind, so there is no honest reason to omit one, and making the compiler insist
 * turns an invariant that had to be re-checked by hand across call sites into one it enforces.
 */
export function validateAgainstSchema(fields: Record<string, unknown>, fieldDefs: readonly SchemaFieldDef[], kind: SchemaDefKind): string[] {
  const reasons: string[] = [];
  const declared = new Set(fieldDefs.map((field) => field.name));

  for (const fieldDef of fieldDefs) {
    if (!(fieldDef.name in fields)) {
      if (fieldDef.is_required) reasons.push(`missing_required_field:${fieldDef.name}`);
      continue;
    }
    if (!FIELD_TYPE_VALIDATORS[fieldDef.type](fields[fieldDef.name])) {
      reasons.push(`field_type_mismatch:${fieldDef.name}`);
    }
  }

  const implicitEnvelopeFields: readonly string[] = kind === 'event' ? IMPLICIT_EVENT_ENVELOPE_FIELDS : [];
  for (const key of Object.keys(fields)) {
    if (!declared.has(key)) {
      if (implicitEnvelopeFields.includes(key)) {
        // Accepted implicitly, but still type-checked: the snippet only ever
        // sends strings here, so a non-string value is malformed input, not
        // a schema-registration gap.
        if (typeof fields[key] !== 'string') {
          reasons.push(`field_type_mismatch:${key}`);
        }
        continue;
      }
      reasons.push(`unregistered_field:${key}`);
    }
  }

  return reasons;
}

/**
 * Includes `schemaName` (not just `kind`) in the hash: for entities in
 * particular, a client-supplied `id` is only guaranteed unique *within* one
 * `type` (the same way two SQL tables can both have a row `id: 123`), so
 * dedup must be scoped per schema family, not just per kind — otherwise a
 * `product` and a `customer` sharing id `123` in the same environment would
 * wrongly dedupe against each other. Exported so `quarantine.service.ts`'s replay path claims the
 * exact same dedup slot an originally-accepted resend of this client id would have claimed.
 */
export function dedupKeyId(environmentId: string, kind: SchemaDefKind, schemaName: string, clientId: string): string {
  return createHash('sha256').update(`${environmentId}:${kind}:${schemaName}:${clientId}`).digest('hex');
}

/**
 * Prefetch every distinct schema a batch needs, in parallel, rather than one `await` per record -
 * a batch touching k distinct event/entity/measure names costs one round of k concurrent reads
 * instead of up to k sequential ones. Records whose envelope already failed need no schema.
 */
async function prefetchActiveSchemas(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  records: readonly Pick<PreparedRecord, 'schemaName' | 'envelopeReasons'>[],
): Promise<Map<string, Awaited<ReturnType<typeof getActiveSchemaDefinition>>>> {
  const schemaNames = Array.from(new Set(records.filter((record) => record.envelopeReasons.length === 0).map((record) => record.schemaName)));
  return new Map(await Promise.all(schemaNames.map(async (name) => [name, await getActiveSchemaDefinition(organizationId, projectId, kind, name)] as const)));
}

/**
 * Why a record with a valid envelope does not conform to its registered schema: the schema is not
 * registered, or the fields do not match it. Empty when it conforms. The one schema check both
 * ingest and `validateIngestBatch` run, so a validation pass can never disagree with ingest.
 */
function schemaConformanceReasons(
  record: Pick<PreparedRecord, 'schemaName' | 'fieldsToValidate'>,
  schemaDef: Awaited<ReturnType<typeof getActiveSchemaDefinition>> | undefined,
  kind: SchemaDefKind,
): string[] {
  if (!schemaDef) {
    return [`schema_not_registered:${record.schemaName}`];
  }
  return validateAgainstSchema(record.fieldsToValidate, schemaDef.field_defs, kind);
}

/** Every count the batch summary needs, in one pass over `results` rather than one `.filter()` per status. */
function tallyByStatus(results: readonly IngestRecordResult[]): Record<IngestRecordStatus, number> {
  const counts: Record<IngestRecordStatus, number> = { accepted: 0, quarantined: 0, duplicate: 0 };
  for (const result of results) {
    counts[result.status] += 1;
  }
  return counts;
}

/**
 * Validates and persists one ingest batch (KAN-32 AC: "batch validation ...
 * idempotency by client id, 202 + `batch_id`, per-record results"). Every
 * record gets its own outcome rather than the whole call failing on the
 * first bad record — envelope problems and unregistered/mismatched schema
 * fields quarantine just that record; a client id already claimed by an
 * earlier accepted record marks it `duplicate`.
 *
 * Not transactional, the same documented, deliberately-deferred tradeoff as
 * `schema-registry.service.ts`'s active-version read: two concurrent batches
 * presenting the same client id can each pass the dedup existence check
 * before either claims it, so both could be accepted. A quarantined record
 * never claims its dedup slot, so a corrected retry with the same client id
 * can still succeed later.
 */
export async function ingestBatch(params: IngestBatchParams): Promise<IngestBatchSummary> {
  const records = params.input.records;
  if (records.length === 0) {
    throw new EmptyIngestBatchError();
  }
  if (records.length > MAX_INGEST_BATCH_SIZE) {
    throw new IngestBatchTooLargeError(MAX_INGEST_BATCH_SIZE);
  }

  // One record per input record, its dedup id computed alongside it — kept as
  // a single array of objects (rather than several arrays sharing an index)
  // so a future edit that filters/reorders records can't silently desync a
  // record from its own dedup id or existing-claim lookup.
  const prepared = records.map((record, index) => {
    const p = prepareRecord(params.input, record, index);
    return { ...p, dedupId: dedupKeyId(params.environmentId, params.input.kind, p.schemaName, p.clientId) };
  });

  const existingClaims = await Promise.all(
    prepared.map((record) =>
      IngestDedupKeyModel.init(record.dedupId, { organization_id: params.organizationId, project_id: params.projectId }),
    ),
  );
  const preparedWithClaims = prepared.map((record, index) => ({ ...record, existingClaim: existingClaims[index] }));

  const schemaDefsByName = await prefetchActiveSchemas(params.organizationId, params.projectId, params.input.kind, preparedWithClaims);

  const recordResults: IngestRecordResult[] = [];
  const acceptedClaims: { dedupId: string; clientId: string; schemaName: string; payload: Record<string, unknown>; contentHash?: string }[] = [];
  // Every quarantined record's raw payload (KAN-34), persisted best-effort after the batch itself is
  // durable — see the comment on the `QuarantinedRecordModel` writes below.
  const quarantinedToPersist: { clientId: string; schemaName: string; payload: Record<string, unknown>; reasons: string[] }[] = [];
  // Two records in the *same* batch sharing a client id must also dedupe
  // against each other, not only against a claim already persisted by an
  // earlier batch — `existingClaims` alone can't catch that since neither
  // has been saved yet at read time. For entities this means one version per
  // entity per batch (the first): the warehouse keeps one row per
  // (batch, client id) too, so a second version in the same batch could not
  // land there anyway. Send later versions in later batches.
  const acceptedInThisBatch = new Set<string>();

  for (const record of preparedWithClaims) {
    if (record.envelopeReasons.length > 0) {
      recordResults.push({ client_id: record.clientId, status: 'quarantined', reasons: record.envelopeReasons });
      quarantinedToPersist.push({
        clientId: record.clientId,
        schemaName: record.schemaName,
        payload: record.raw,
        reasons: record.envelopeReasons,
      });
      continue;
    }
    if (isDuplicateOfClaim(params.input.kind, record.existingClaim, record.contentHash) || acceptedInThisBatch.has(record.dedupId)) {
      recordResults.push({ client_id: record.clientId, status: 'duplicate' });
      continue;
    }

    const reasons = schemaConformanceReasons(record, schemaDefsByName.get(record.schemaName), params.input.kind);
    if (reasons.length > 0) {
      recordResults.push({ client_id: record.clientId, status: 'quarantined', reasons });
      quarantinedToPersist.push({ clientId: record.clientId, schemaName: record.schemaName, payload: record.raw, reasons });
    } else {
      recordResults.push({ client_id: record.clientId, status: 'accepted' });
      acceptedClaims.push({
        dedupId: record.dedupId,
        clientId: record.clientId,
        schemaName: record.schemaName,
        payload: record.raw,
        contentHash: record.contentHash,
      });
      acceptedInThisBatch.add(record.dedupId);
    }
  }

  const counts = tallyByStatus(recordResults);
  const batch = new IngestBatchModel();
  batch.organization_id = params.organizationId;
  batch.project_id = params.projectId;
  batch.environment_id = params.environmentId;
  batch.kind = params.input.kind;
  batch.total_count = recordResults.length;
  batch.accepted_count = counts.accepted;
  batch.quarantined_count = counts.quarantined;
  batch.duplicate_count = counts.duplicate;
  batch.record_results = recordResults;
  batch.created_at = new Date().toISOString();
  batch.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await batch.save();

  // KAN-34: persist every quarantined record's raw payload durably so it has something to replay once
  // its schema is fixed — `record_results` above only ever stores the validation outcome, not the
  // payload. Best-effort and independent per record, the same tradeoff as the dedup-key claims and
  // pipeline publish just below: a write failure here only means that one record has no durable
  // quarantine entry to replay later, never a reason to turn an otherwise-successful 202 into a 500.
  await Promise.all(
    quarantinedToPersist.map(async ({ clientId, schemaName, payload, reasons }) => {
      const quarantined = new QuarantinedRecordModel();
      quarantined.organization_id = params.organizationId;
      quarantined.project_id = params.projectId;
      quarantined.environment_id = params.environmentId;
      quarantined.batch_id = batch.id;
      quarantined.kind = params.input.kind;
      quarantined.schema_name = schemaName;
      quarantined.client_id = clientId;
      quarantined.payload = payload;
      quarantined.reasons = reasons;
      quarantined.status = 'quarantined';
      quarantined.created_at = batch.created_at;
      quarantined.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
      try {
        await quarantined.save();
      } catch {
        // Best-effort — see the comment above this call.
      }
    }),
  );

  // Claim each accepted record's dedup key independently and best-effort,
  // after the batch itself is already durable and its summary computed
  // above: a write failure here only means a later duplicate of that one
  // record might slip through unnoticed, the same kind of eventual-
  // consistency tradeoff this function already accepts for two concurrent
  // batches racing on the same client id — not a reason to turn an
  // otherwise-successful ingest into a 500 for the caller.
  await Promise.all(
    acceptedClaims.map(async ({ dedupId, clientId, contentHash }) => {
      const claim = new IngestDedupKeyModel();
      claim.organization_id = params.organizationId;
      claim.project_id = params.projectId;
      claim.environment_id = params.environmentId;
      claim.kind = params.input.kind;
      claim.client_id = clientId;
      claim.batch_id = batch.id;
      claim.created_at = batch.created_at;
      if (contentHash !== undefined) {
        // Overwrites the previous version's claim: the latest version is what the next upsert is compared with.
        claim.content_hash = contentHash;
      }
      claim.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
      try {
        await claim.save(dedupId);
      } catch {
        // Best-effort — see the comment above this call.
      }
    }),
  );

  // KAN-33: publish every accepted record to the pipeline (Pub/Sub-stand-in outbox) and land exactly
  // those messages in the warehouse raw-table stand-in — scoped to this batch's own records via
  // `landPipelineMessages`, never a query over the whole environment's backlog (that's
  // `drainPendingPipelineMessages`, a separate catch-up sweep for a future worker), so concurrent
  // `ingestBatch` calls never race over each other's messages or pay for landing each other's
  // records. Best-effort for the same reason as the dedup-key claims just above — a transient
  // pipeline failure must not turn an otherwise-successful 202 into a 500; a record whose landing
  // fails is marked `failed` for KAN-34's future replay/DLQ to pick up, not surfaced to this caller.
  //
  // KAN-65: for `event`-kind batches, every message that actually landed is then checked against
  // this project's active win rules, synchronously, right here — the "ingest -> Pub/Sub -> WebSocket"
  // realtime path's first two hops, sharing this exact landing step rather than a separate sweep, so
  // a win is detected within the same request that accepted it. Each record is evaluated
  // independently (`Promise.allSettled`) so one record's win-rule failure can't block its batch-mates.
  if (acceptedClaims.length > 0) {
    try {
      const messages = await enqueueAcceptedRecordsForPipeline({
        organizationId: params.organizationId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        batchId: batch.id,
        kind: params.input.kind,
        records: acceptedClaims.map(({ clientId, schemaName, payload }) => ({ clientId, schemaName, payload })),
      });
      await landPipelineMessages(messages);

      if (params.input.kind === 'event') {
        const delivered = messages.filter((message) => message.status === 'delivered');
        await Promise.allSettled(
          delivered.map((message) =>
            evaluateRecordAgainstWinRules({
              organizationId: params.organizationId,
              projectId: params.projectId,
              environmentId: params.environmentId,
              kind: message.kind,
              schemaName: message.schema_name,
              clientId: message.client_id,
              payload: message.payload,
              rawRecordId: message.id,
              occurredAt: message.delivered_at ?? new Date().toISOString(),
            }),
          ),
        );
      }
    } catch {
      // Best-effort — see the comment above this block.
    }
  }

  return {
    batchId: batch.id,
    kind: batch.kind,
    total: batch.total_count,
    accepted: batch.accepted_count,
    quarantined: batch.quarantined_count,
    duplicates: batch.duplicate_count,
    rejected: recordResults.filter((result) => result.status !== 'accepted'),
  };
}

/** `GET /v1/ingest/batches/{batch_id}` (KAN-32 AC: "per-record results endpoint"). Scoped to the caller's own org/project/environment — a batch id from a sibling environment or project returns `null`, the same 404-not-403 non-enumeration posture as every other cross-tenant lookup in this codebase. */
export async function getIngestBatch(
  organizationId: string,
  projectId: string,
  environmentId: string,
  batchId: string,
): Promise<IngestBatchModel | null> {
  const batch = await IngestBatchModel.init(batchId, { organization_id: organizationId, project_id: projectId });
  if (
    !batch ||
    batch.organization_id !== organizationId ||
    batch.project_id !== projectId ||
    batch.environment_id !== environmentId
  ) {
    return null;
  }
  return batch;
}

export type IngestValidationStatus = 'valid' | 'invalid';

export interface IngestValidationRecordResult {
  client_id: string;
  status: IngestValidationStatus;
  /** The reasons ingest would quarantine the record for; absent when valid. */
  reasons?: string[];
}

export interface IngestValidationSummary {
  kind: SchemaDefKind;
  total: number;
  valid: number;
  invalid: number;
  records: IngestValidationRecordResult[];
}

/**
 * Checks a batch against the envelope rules and the project's registered schemas exactly as
 * `ingestBatch` would, and stores nothing (KAN-202 I3): no batch, no dedup claim, no quarantine
 * entry, no pipeline publish. For an integrator's CI conformance tests - a payload that validates
 * here is accepted by ingest unless it repeats a record already accepted (dedup is not a property
 * of the payload's shape, so it is not evaluated). Schemas are project-wide, so no environment is
 * involved.
 */
export async function validateIngestBatch(params: Omit<IngestBatchParams, 'environmentId'>): Promise<IngestValidationSummary> {
  const records = params.input.records;
  if (records.length === 0) {
    throw new EmptyIngestBatchError();
  }
  if (records.length > MAX_INGEST_BATCH_SIZE) {
    throw new IngestBatchTooLargeError(MAX_INGEST_BATCH_SIZE);
  }
  const prepared = records.map((record, index) => prepareRecord(params.input, record, index));
  const schemaDefsByName = await prefetchActiveSchemas(params.organizationId, params.projectId, params.input.kind, prepared);
  const results: IngestValidationRecordResult[] = prepared.map((record) => {
    const reasons = record.envelopeReasons.length > 0 ? record.envelopeReasons : schemaConformanceReasons(record, schemaDefsByName.get(record.schemaName), params.input.kind);
    return reasons.length > 0 ? { client_id: record.clientId, status: 'invalid', reasons } : { client_id: record.clientId, status: 'valid' };
  });
  const valid = results.filter((result) => result.status === 'valid').length;
  return { kind: params.input.kind, total: results.length, valid, invalid: results.length - valid, records: results };
}

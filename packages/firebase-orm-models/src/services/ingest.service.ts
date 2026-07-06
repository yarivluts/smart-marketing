import { IngestBatchModel } from '../models/ingest-batch.model';
import { IngestRecordModel, type IngestRecordStatus } from '../models/ingest-record.model';
import { getActiveSchemaDefinition } from './schema-registry.service';
import type { SchemaDefKind, SchemaDefModel, SchemaFieldDef, SchemaFieldType } from '../models/schema-def.model';

export class EmptyIngestBatchError extends Error {
  constructor() {
    super('A batch must contain at least one record.');
    this.name = 'EmptyIngestBatchError';
  }
}

export class InvalidIngestRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIngestRecordError';
  }
}

export class IngestBatchNotFoundError extends Error {
  constructor() {
    super('Ingest batch not found in this project.');
    this.name = 'IngestBatchNotFoundError';
  }
}

// Keeps one batch write bounded and load-testable (plan `13 §E3.2` AC: "1k
// events/s sustained") rather than letting a single request fan out into an
// unbounded number of Firestore writes.
export const MAX_INGEST_BATCH_SIZE = 1000;

/** One record as submitted, already normalized from its HTTP shape (events/entities/measures each parse differently — that's the caller's job, not this service's). */
export interface IngestRecordInput {
  /** Client-supplied idempotency key: `event_id` for events, `id` for entities, a caller-derived key for measures. */
  clientRecordId: string;
  /** The schema family this record validates against: an event name, entity type, or measure name. */
  name: string;
  /** The fields to validate against the active schema's `field_defs` (an event's `properties`, an entity's `attributes`, a measure's `dimensions`). */
  data: Record<string, unknown>;
}

export interface IngestBatchParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  kind: SchemaDefKind;
  records: readonly IngestRecordInput[];
}

export interface IngestRecordResult {
  clientRecordId: string;
  name: string;
  status: IngestRecordStatus;
  reasons: readonly string[];
}

export interface IngestBatchResult {
  batchId: string;
  kind: SchemaDefKind;
  submitted: number;
  accepted: number;
  quarantined: number;
  duplicate: number;
  records: readonly IngestRecordResult[];
}

function matchesFieldType(value: unknown, type: SchemaFieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'timestamp':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
  }
}

/** Validates one record's data against its schema's declared fields. Extra fields not in the schema are allowed (additive, matching the registry's own non-breaking-evolution posture). */
function validateRecordData(data: Record<string, unknown>, fieldDefs: readonly SchemaFieldDef[]): string[] {
  const reasons: string[] = [];
  for (const fieldDef of fieldDefs) {
    const value = data[fieldDef.name];
    const present = value !== undefined && value !== null;
    if (fieldDef.is_required && !present) {
      reasons.push(`Missing required field "${fieldDef.name}".`);
      continue;
    }
    if (present && !matchesFieldType(value, fieldDef.type)) {
      reasons.push(`Field "${fieldDef.name}" expected type "${fieldDef.type}".`);
    }
  }
  return reasons;
}

/** Whether `clientRecordId` was already successfully ingested before (in an earlier batch). A record that was only ever `quarantined` was never actually accepted, so resubmitting it after a fix is not a duplicate. */
async function wasAlreadyAccepted(
  organizationId: string,
  projectId: string,
  environmentId: string,
  kind: SchemaDefKind,
  clientRecordId: string,
): Promise<boolean> {
  const matches = await IngestRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('environment_id', '==', environmentId)
    .where('kind', '==', kind)
    .where('client_record_id', '==', clientRecordId)
    .where('status', '==', 'accepted')
    .limit(1)
    .get();
  return matches.length > 0;
}

/**
 * Validates and persists one ingest batch (KAN-32: plan `13 §E3.2`).
 * `organizationId`/`projectId`/`environmentId` are trusted as already
 * authenticated — the caller (the ingest API's API-key guard) resolves and
 * verifies them via `verifyApiKeyForRequest` before this ever runs, so this
 * service deliberately does not re-check project/environment existence: an
 * extra Firestore read per batch would work against the same "1k events/s"
 * AC this story is trying to satisfy.
 *
 * Every record needs an active schema for its `kind`+`name` or it's
 * quarantined with a reason; a record whose `client_record_id` was already
 * accepted (in this batch or an earlier one) is reported as `duplicate` and
 * not re-validated or re-counted as accepted (AC: "duplicate event_id
 * deduped").
 */
export async function ingestBatch(params: IngestBatchParams): Promise<IngestBatchResult> {
  if (params.records.length === 0) {
    throw new EmptyIngestBatchError();
  }
  if (params.records.length > MAX_INGEST_BATCH_SIZE) {
    throw new InvalidIngestRecordError(`A batch may contain at most ${MAX_INGEST_BATCH_SIZE} records.`);
  }
  for (const record of params.records) {
    if (!record.clientRecordId.trim()) {
      throw new InvalidIngestRecordError('Every record must include a non-empty client-supplied id.');
    }
    if (!record.name.trim()) {
      throw new InvalidIngestRecordError('Every record must include a non-empty schema name.');
    }
  }

  const schemaCache = new Map<string, SchemaDefModel | null>();
  const seenInBatch = new Set<string>();
  const results: IngestRecordResult[] = [];
  let accepted = 0;
  let quarantined = 0;
  let duplicate = 0;

  for (const record of params.records) {
    const clientRecordId = record.clientRecordId.trim();
    const name = record.name.trim();

    if (seenInBatch.has(clientRecordId)) {
      duplicate += 1;
      results.push({
        clientRecordId,
        name,
        status: 'duplicate',
        reasons: ['Duplicate client id within this batch.'],
      });
      continue;
    }

    if (await wasAlreadyAccepted(params.organizationId, params.projectId, params.environmentId, params.kind, clientRecordId)) {
      seenInBatch.add(clientRecordId);
      duplicate += 1;
      results.push({
        clientRecordId,
        name,
        status: 'duplicate',
        reasons: ['Already ingested in an earlier batch.'],
      });
      continue;
    }
    seenInBatch.add(clientRecordId);

    let schemaDef = schemaCache.get(name);
    if (schemaDef === undefined) {
      schemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, params.kind, name);
      schemaCache.set(name, schemaDef);
    }

    const reasons: string[] = schemaDef
      ? validateRecordData(record.data, schemaDef.field_defs)
      : [`No active schema registered for ${params.kind} "${name}".`];
    const status: IngestRecordStatus = reasons.length > 0 ? 'quarantined' : 'accepted';
    if (status === 'accepted') {
      accepted += 1;
    } else {
      quarantined += 1;
    }
    results.push({ clientRecordId, name, status, reasons });
  }

  const now = new Date().toISOString();
  const batch = new IngestBatchModel();
  batch.organization_id = params.organizationId;
  batch.project_id = params.projectId;
  batch.environment_id = params.environmentId;
  batch.kind = params.kind;
  batch.submitted_count = params.records.length;
  batch.accepted_count = accepted;
  batch.quarantined_count = quarantined;
  batch.duplicate_count = duplicate;
  batch.created_at = now;
  batch.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await batch.save();

  await Promise.all(
    results.map((result, index) => {
      const record = new IngestRecordModel();
      record.organization_id = params.organizationId;
      record.project_id = params.projectId;
      record.environment_id = params.environmentId;
      record.batch_id = batch.id;
      record.kind = params.kind;
      record.name = result.name;
      record.client_record_id = result.clientRecordId;
      record.status = result.status;
      record.reasons = [...result.reasons];
      record.payload = params.records[index]!.data;
      record.created_at = now;
      record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
      return record.save();
    }),
  );

  return {
    batchId: batch.id,
    kind: params.kind,
    submitted: params.records.length,
    accepted,
    quarantined,
    duplicate,
    records: results,
  };
}

export interface IngestBatchDetail {
  batchId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  kind: SchemaDefKind;
  submitted: number;
  accepted: number;
  quarantined: number;
  duplicate: number;
  createdAt: string;
  records: readonly IngestRecordResult[];
}

/** Per-record validation results for one batch (KAN-32 AC: "per-record results endpoint"). */
export async function getIngestBatch(
  organizationId: string,
  projectId: string,
  batchId: string,
): Promise<IngestBatchDetail> {
  const batch = await IngestBatchModel.init(batchId, { organization_id: organizationId, project_id: projectId });
  if (!batch || batch.organization_id !== organizationId || batch.project_id !== projectId) {
    throw new IngestBatchNotFoundError();
  }

  const records = await IngestRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('batch_id', '==', batchId)
    .get();
  records.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return {
    batchId: batch.id,
    organizationId: batch.organization_id,
    projectId: batch.project_id,
    environmentId: batch.environment_id,
    kind: batch.kind,
    submitted: batch.submitted_count,
    accepted: batch.accepted_count,
    quarantined: batch.quarantined_count,
    duplicate: batch.duplicate_count,
    createdAt: batch.created_at,
    records: records.map((record) => ({
      clientRecordId: record.client_record_id,
      name: record.name,
      status: record.status,
      reasons: record.reasons,
    })),
  };
}

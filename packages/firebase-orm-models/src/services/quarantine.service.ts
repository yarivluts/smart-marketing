import { IngestDedupKeyModel } from '../models/ingest-dedup-key.model';
import { QuarantinedRecordModel } from '../models/quarantined-record.model';
import { checkRecordEnvelope, dedupKeyId, validateAgainstSchema } from './ingest.service';
import { getActiveSchemaDefinition } from './schema-registry.service';
import { enqueueAcceptedRecordsForPipeline, landPipelineMessages } from './pipeline.service';
import { recordAuditLogEntry } from './audit-log.service';

export class QuarantinedRecordNotFoundError extends Error {
  constructor() {
    super('Quarantined record not found.');
    this.name = 'QuarantinedRecordNotFoundError';
  }
}

/** Thrown by {@link dismissQuarantinedRecord} for a record that has already left the `quarantined` state (already replayed, or already dismissed) — same "already been decided" posture as `AttachmentNotPendingError`. */
export class QuarantinedRecordNotActionableError extends Error {
  constructor() {
    super('This quarantined record has already been resolved and can no longer be dismissed.');
    this.name = 'QuarantinedRecordNotActionableError';
  }
}

/** Same cap as `listRecentIngestBatchesForProject` (KAN-35) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_QUARANTINED_RECORD_LIST_LIMIT = 200;

/**
 * The most recent quarantined records for a project, newest first — the durable-payload counterpart
 * of KAN-35's `listRecentIngestBatchesForProject` (which only ever exposed validation status, not the
 * payload). Not scoped to one environment, same "fold every environment into one admin view" posture
 * as that function and `listApiKeysForProject`.
 */
export async function listQuarantinedRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_QUARANTINED_RECORD_LIST_LIMIT,
): Promise<QuarantinedRecordModel[]> {
  return QuarantinedRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('status', '==', 'quarantined')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
}

export type ReplayQuarantinedRecordOutcome = 'accepted' | 'duplicate' | 'still_quarantined';

export interface ReplayQuarantinedRecordResult {
  outcome: ReplayQuarantinedRecordOutcome;
  /** Present only when `outcome` is `still_quarantined` — the refreshed validation reasons. */
  reasons?: string[];
}

/**
 * Replays one quarantined record (KAN-34 AC: "replay after schema fix succeeds") — re-validates its
 * persisted raw payload against the *current* active schema (which may have evolved since the record
 * was first quarantined) and, if it now passes, accepts it exactly the way `ingestBatch` would have:
 * claims its dedup slot, publishes it to the pipeline, and lands it in the warehouse raw-table
 * stand-in. Scoped to the caller's own org/project via a 404-not-403 lookup (KAN-26 posture), the same
 * as `getIngestBatch`.
 *
 * A record whose reasons still don't clear (schema still missing the fix, or still-unregistered
 * fields) is left `quarantined` with its `reasons` refreshed to the current failure — it can be
 * replayed again later. A record that now validates but whose dedup slot was already claimed by
 * another accepted record in the meantime resolves as `duplicate`, not `accepted` — same "duplicate is
 * benign, not an error" posture as `ingestBatch`'s own dedup handling — and is marked `replayed` so it
 * doesn't sit in the quarantine browser forever presenting as actionable when it isn't.
 */
export async function replayQuarantinedRecord(
  organizationId: string,
  projectId: string,
  quarantinedRecordId: string,
  performedByUserId: string,
): Promise<ReplayQuarantinedRecordResult> {
  const record = await QuarantinedRecordModel.init(quarantinedRecordId, {
    organization_id: organizationId,
    project_id: projectId,
  });
  if (!record || record.organization_id !== organizationId || record.project_id !== projectId) {
    throw new QuarantinedRecordNotFoundError();
  }

  const { fieldsToValidate, envelopeReasons } = checkRecordEnvelope(record.kind, record.payload);
  let reasons = envelopeReasons;
  if (reasons.length === 0) {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, record.kind, record.schema_name);
    reasons = schemaDef
      ? validateAgainstSchema(fieldsToValidate, schemaDef.field_defs, record.kind)
      : [`schema_not_registered:${record.schema_name}`];
  }

  if (reasons.length > 0) {
    record.reasons = reasons;
    await record.save();
    await recordReplayAudit(organizationId, projectId, record, performedByUserId, 'still_quarantined', reasons);
    return { outcome: 'still_quarantined', reasons };
  }

  const dedupId = dedupKeyId(record.environment_id, record.kind, record.schema_name, record.client_id);
  const existingClaim = await IngestDedupKeyModel.init(dedupId, {
    organization_id: organizationId,
    project_id: projectId,
  });
  if (existingClaim) {
    record.status = 'replayed';
    record.replayed_at = new Date().toISOString();
    await record.save();
    await recordReplayAudit(organizationId, projectId, record, performedByUserId, 'duplicate');
    return { outcome: 'duplicate' };
  }

  const claim = new IngestDedupKeyModel();
  claim.organization_id = organizationId;
  claim.project_id = projectId;
  claim.environment_id = record.environment_id;
  claim.kind = record.kind;
  claim.client_id = record.client_id;
  claim.batch_id = record.batch_id;
  claim.created_at = new Date().toISOString();
  claim.setPathParams({ organization_id: organizationId, project_id: projectId });
  try {
    await claim.save(dedupId);
  } catch {
    // Best-effort, same tradeoff `ingestBatch` accepts for its own dedup-key claims: a write failure
    // here only means a later duplicate replay of this same record might slip through unnoticed.
  }

  try {
    const messages = await enqueueAcceptedRecordsForPipeline({
      organizationId,
      projectId,
      environmentId: record.environment_id,
      batchId: record.batch_id,
      kind: record.kind,
      records: [{ clientId: record.client_id, schemaName: record.schema_name, payload: record.payload }],
    });
    await landPipelineMessages(messages);
  } catch {
    // Best-effort, same tradeoff `ingestBatch` accepts for its own pipeline publish: a transient
    // pipeline failure must not turn a successful replay into a thrown error for the admin caller.
  }

  record.status = 'replayed';
  record.replayed_at = new Date().toISOString();
  await record.save();
  await recordReplayAudit(organizationId, projectId, record, performedByUserId, 'accepted');
  return { outcome: 'accepted' };
}

/** Best-effort audit entry for one replay attempt — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed rather than propagated. */
async function recordReplayAudit(
  organizationId: string,
  projectId: string,
  record: QuarantinedRecordModel,
  performedByUserId: string,
  outcome: ReplayQuarantinedRecordOutcome,
  reasons?: string[],
): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      environmentId: record.environment_id,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'quarantined_record.replay',
      targetType: 'quarantined_record',
      targetId: record.id,
      summary: `Replayed quarantined record "${record.client_id}" (${record.kind}:${record.schema_name}) -> ${outcome}`,
      after: reasons ? { outcome, reasons } : { outcome },
    });
  } catch {
    // Best-effort — see the comment on `recordAuditLogEntry`.
  }
}

export interface DismissQuarantinedRecordResult {
  outcome: 'dismissed';
}

/**
 * Permanently discards one quarantined record without attempting to replay it (KAN-131, a follow-up
 * to KAN-34's replay-only quarantine browser). `replayQuarantinedRecord` covers "the schema/payload
 * got fixed, try again" — but nothing covered "this will never validate and isn't worth a schema
 * change" (an abandoned integration's payload, a one-off malformed test event). Before this, such a
 * record just sat in `listQuarantinedRecordsForProject`'s bounded, `status == 'quarantined'` list
 * forever, presenting as actionable and crowding out records an operator could actually still act on
 * — the same "sits forever, forces itself into an admin's attention" problem KAN-127/KAN-129 already
 * closed for TV pairings and shared credentials/templates/people, just for a different registry.
 *
 * Scoped to the caller's own org/project via a 404-not-403 lookup, the same posture as
 * `replayQuarantinedRecord`. Only a record still in `quarantined` can be dismissed — one already
 * `replayed` succeeded into the pipeline and dismissing it after the fact would misrepresent what
 * happened, and one already `dismissed` has nothing left to do; both throw
 * {@link QuarantinedRecordNotActionableError}. Terminal and one-way, same as `replayed` — there is no
 * `undismiss`.
 */
export async function dismissQuarantinedRecord(
  organizationId: string,
  projectId: string,
  quarantinedRecordId: string,
  performedByUserId: string,
): Promise<DismissQuarantinedRecordResult> {
  const record = await QuarantinedRecordModel.init(quarantinedRecordId, {
    organization_id: organizationId,
    project_id: projectId,
  });
  if (!record || record.organization_id !== organizationId || record.project_id !== projectId) {
    throw new QuarantinedRecordNotFoundError();
  }
  if (record.status !== 'quarantined') {
    throw new QuarantinedRecordNotActionableError();
  }

  record.status = 'dismissed';
  record.dismissed_at = new Date().toISOString();
  record.dismissed_by_user_id = performedByUserId;
  await record.save();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      environmentId: record.environment_id,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'quarantined_record.dismiss',
      targetType: 'quarantined_record',
      targetId: record.id,
      summary: `Dismissed quarantined record "${record.client_id}" (${record.kind}:${record.schema_name}) without replay`,
      after: { reasons: record.reasons },
    });
  } catch {
    // Best-effort — see the comment on `recordAuditLogEntry`.
  }

  return { outcome: 'dismissed' };
}

import {
  applyFieldMapping,
  mappingTargetFields,
  suggestFieldMappingRules as suggestMappingRulesFromSample,
  validateMappingRules,
  type MappingApplyResult,
  type MappingRecordKind,
  type MappingRule,
  type MappingRuleInput,
  type MappingSuggestion,
} from '@growthos/shared';
import { EnvironmentModel } from '../models/environment.model';
import { FieldMappingModel } from '../models/field-mapping.model';
import { HookEndpointModel } from '../models/hook-endpoint.model';
import { ProjectModel } from '../models/project.model';
import { isSchemaDefKind, type SchemaDefKind } from '../models/schema-def.model';
import { checkRecordEnvelope, ingestBatch, validateAgainstSchema, type IngestBatchInput, type IngestBatchSummary } from './ingest.service';
import { getActiveSchemaDefinition } from './schema-registry.service';
import { getHookDeliveryForProject } from './hook.service';
import { EnvironmentNotFoundError } from './key.service';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

export class InvalidFieldMappingError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid field mapping: ${reasons.join('; ')}`);
    this.name = 'InvalidFieldMappingError';
  }
}

export class TargetSchemaNotRegisteredError extends Error {
  constructor() {
    super('The target schema is not registered (or has no active version) in this project yet. Register it first.');
    this.name = 'TargetSchemaNotRegisteredError';
  }
}

export class FieldMappingNotFoundError extends Error {
  constructor() {
    super('Field mapping not found in this project.');
    this.name = 'FieldMappingNotFoundError';
  }
}

export class InvalidSamplePayloadError extends Error {
  constructor() {
    super('Sample payload is not valid JSON.');
    this.name = 'InvalidSamplePayloadError';
  }
}

export class FieldMappingDisabledError extends Error {
  constructor() {
    super('This field mapping is disabled. Enable a mapping (or create a new one) before applying it.');
    this.name = 'FieldMappingDisabledError';
  }
}

export class HookDeliveryDiscardedError extends Error {
  constructor() {
    super('This hook delivery was discarded and cannot have a mapping applied to it.');
    this.name = 'HookDeliveryDiscardedError';
  }
}

export class HookDeliveryAlreadyAppliedError extends Error {
  constructor() {
    super('This hook delivery already had a field mapping applied to it.');
    this.name = 'HookDeliveryAlreadyAppliedError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function requireEnvironmentInProject(organizationId: string, projectId: string, environmentId: string): Promise<EnvironmentModel> {
  const environment = await EnvironmentModel.init(environmentId, { organization_id: organizationId, project_id: projectId });
  if (!environment || environment.project_id !== projectId) {
    throw new EnvironmentNotFoundError();
  }
  return environment;
}

async function loadFieldMapping(organizationId: string, projectId: string, fieldMappingId: string): Promise<FieldMappingModel> {
  const mapping = await FieldMappingModel.init(fieldMappingId, { organization_id: organizationId, project_id: projectId });
  if (!mapping || mapping.organization_id !== organizationId || mapping.project_id !== projectId) {
    throw new FieldMappingNotFoundError();
  }
  return mapping;
}

/** `MappingRecordKind` (`@growthos/shared`) and `SchemaDefKind` (this package) are the exact same three strings — see `field-mapping.model.ts`'s doc comment — so a validated `kind` string is trivially both. */
function requireMappingKind(kind: string): SchemaDefKind & MappingRecordKind {
  if (!isSchemaDefKind(kind)) {
    throw new InvalidFieldMappingError([`Unknown mapping kind "${kind}".`]);
  }
  return kind;
}

interface FieldMappingDefinitionInput {
  organizationId: string;
  projectId: string;
  kind: SchemaDefKind & MappingRecordKind;
  name: string;
  schemaName: string;
  rules: readonly MappingRuleInput[];
}

interface ValidatedFieldMappingDefinition {
  name: string;
  schemaName: string;
  rules: MappingRule[];
}

/**
 * Validates a field mapping's own definition — name, target schemaName
 * (must be a registered+active schema of this mapping's `kind`), and rules
 * — shared by {@link createFieldMapping} and {@link updateFieldMapping}
 * (KAN-121) so the two can never validate a definition differently. `kind`
 * itself is immutable once a mapping exists (mirrors `updateSharedCredential`'s
 * (KAN-119) `provider` immutability posture — changing what shape of record
 * a mapping produces isn't a correction, it's a different mapping), so it's
 * supplied already-resolved by each caller rather than accepted as raw user
 * input here.
 */
async function validateFieldMappingDefinition(input: FieldMappingDefinitionInput): Promise<ValidatedFieldMappingDefinition> {
  const reasons: string[] = [];

  const name = input.name.trim();
  if (name.length === 0) {
    reasons.push('A mapping must have a non-empty name.');
  }
  const schemaName = input.schemaName.trim();
  if (schemaName.length === 0) {
    reasons.push('A mapping must target a non-empty schema name.');
  }

  const { rules, reasons: ruleReasons } = validateMappingRules(input.kind, input.rules);
  reasons.push(...ruleReasons);

  if (reasons.length > 0) {
    throw new InvalidFieldMappingError(reasons);
  }

  const activeSchema = await getActiveSchemaDefinition(input.organizationId, input.projectId, input.kind, schemaName);
  if (!activeSchema) {
    throw new TargetSchemaNotRegisteredError();
  }

  return { name, schemaName, rules };
}

export interface CreateFieldMappingParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  hookEndpointId?: string;
  name: string;
  kind: string;
  schemaName: string;
  rules: readonly MappingRuleInput[];
  createdByUserId: string;
}

/**
 * Saves a new field mapping (KAN-54 AC: "saved field-mappings"). Requires an
 * `active` version of the target schema to already be registered (KAN-31) —
 * the same "reject a reference to something that doesn't exist yet" posture
 * `saveBoardTiles` (KAN-60) establishes for a tile's metric reference —
 * since a mapping with no schema to validate against can never produce an
 * acceptable ingest record.
 */
export async function createFieldMapping(params: CreateFieldMappingParams): Promise<FieldMappingModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  await requireEnvironmentInProject(params.organizationId, params.projectId, params.environmentId);

  const kind = requireMappingKind(params.kind);

  if (params.hookEndpointId) {
    const endpoint = await HookEndpointModel.init(params.hookEndpointId, {
      organization_id: params.organizationId,
      project_id: params.projectId,
    });
    if (!endpoint || endpoint.organization_id !== params.organizationId || endpoint.project_id !== params.projectId) {
      throw new InvalidFieldMappingError(['hookEndpointId does not refer to a hook endpoint in this project.']);
    }
  }

  const validated = await validateFieldMappingDefinition({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind,
    name: params.name,
    schemaName: params.schemaName,
    rules: params.rules,
  });

  const mapping = new FieldMappingModel();
  mapping.organization_id = params.organizationId;
  mapping.project_id = params.projectId;
  mapping.environment_id = params.environmentId;
  if (params.hookEndpointId) {
    mapping.hook_endpoint_id = params.hookEndpointId;
  }
  mapping.name = validated.name;
  mapping.kind = kind;
  mapping.schema_name = validated.schemaName;
  mapping.rules = validated.rules;
  mapping.created_by = params.createdByUserId;
  mapping.created_at = new Date().toISOString();
  mapping.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await mapping.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'field_mapping.create',
      targetType: 'field_mapping',
      targetId: mapping.id,
      summary: `Created field mapping "${mapping.name}" (${mapping.kind}:${mapping.schema_name})`,
      after: { kind: mapping.kind, schemaName: mapping.schema_name, ruleCount: mapping.rules.length },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return mapping;
}

/** Every mapping (active or disabled) ever saved for one project — the admin-facing list. */
export async function listFieldMappingsForProject(organizationId: string, projectId: string): Promise<FieldMappingModel[]> {
  return FieldMappingModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

export interface DisableFieldMappingParams {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  disabledByUserId: string;
}

/** Retires a mapping immediately (idempotent — re-disabling refreshes `disabled_at`/`disabled_by`, the same "safe to retry" posture `disableHookEndpoint`/`revokeApiKey` establish). */
export async function disableFieldMapping(params: DisableFieldMappingParams): Promise<FieldMappingModel> {
  const mapping = await loadFieldMapping(params.organizationId, params.projectId, params.fieldMappingId);
  mapping.disabled_at = new Date().toISOString();
  mapping.disabled_by = params.disabledByUserId;
  await mapping.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: mapping.environment_id,
      actorType: 'user',
      actorId: params.disabledByUserId,
      action: 'field_mapping.disable',
      targetType: 'field_mapping',
      targetId: mapping.id,
      summary: `Disabled field mapping "${mapping.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return mapping;
}

export interface EnableFieldMappingParams {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  enabledByUserId: string;
}

/**
 * Resumes a retired mapping (the human-facing "Enable" counterpart {@link disableFieldMapping} never
 * got — a mistakenly-disabled mapping was previously stuck disabled forever, the only way back being
 * to recreate it and re-enter every rule by hand). Idempotent the same way `disableFieldMapping` is:
 * enabling an already-enabled mapping just clears already-empty fields and logs again, rather than
 * erroring — the "safe to retry" posture that function's own doc comment establishes, kept symmetric
 * here.
 */
export async function enableFieldMapping(params: EnableFieldMappingParams): Promise<FieldMappingModel> {
  const mapping = await loadFieldMapping(params.organizationId, params.projectId, params.fieldMappingId);
  mapping.disabled_at = null;
  mapping.disabled_by = null;
  await mapping.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: mapping.environment_id,
      actorType: 'user',
      actorId: params.enabledByUserId,
      action: 'field_mapping.enable',
      targetType: 'field_mapping',
      targetId: mapping.id,
      summary: `Enabled field mapping "${mapping.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return mapping;
}

export interface UpdateFieldMappingParams {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  name: string;
  schemaName: string;
  rules: readonly MappingRuleInput[];
  actorUserId: string;
}

/**
 * Edits an existing field mapping's own definition — name, target
 * schemaName, and rules — always a full replace, never a sparse patch, the
 * same posture `updateSegmentDefinition` (KAN-120), `updateResourceTemplate`
 * (KAN-117), and `updateOrgPerson` (KAN-100) establish for their own sibling
 * registries. `kind` and `environmentId` stay immutable: `kind` decides the
 * shape of record this mapping produces (see {@link validateFieldMappingDefinition}'s
 * own doc comment), and `environmentId` decides which environment a mapped
 * record lands in — both structural facts about the mapping, not something
 * to "fix". Until now a saved mapping's own definition could only be
 * corrected by disable-and-recreate, which orphans its id — breaking any
 * `HookDeliveryModel.applied_field_mapping_id` reference from a delivery
 * already applied through it (KAN-54's own follow-up). Reuses
 * {@link validateFieldMappingDefinition} directly so create and update can
 * never validate a definition differently.
 */
export async function updateFieldMapping(params: UpdateFieldMappingParams): Promise<FieldMappingModel> {
  const mapping = await loadFieldMapping(params.organizationId, params.projectId, params.fieldMappingId);
  const kind = requireMappingKind(mapping.kind);

  const validated = await validateFieldMappingDefinition({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind,
    name: params.name,
    schemaName: params.schemaName,
    rules: params.rules,
  });

  const before = { name: mapping.name, schemaName: mapping.schema_name, rules: mapping.rules };

  mapping.name = validated.name;
  mapping.schema_name = validated.schemaName;
  mapping.rules = validated.rules;
  await mapping.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: mapping.environment_id,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'field_mapping.update',
      targetType: 'field_mapping',
      targetId: mapping.id,
      summary: `Updated field mapping "${mapping.name}" definition`,
      before,
      after: { name: mapping.name, schemaName: mapping.schema_name, rules: mapping.rules },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return mapping;
}

export interface TestRunFieldMappingParams {
  organizationId: string;
  projectId: string;
  /** Either an already-saved mapping's id, or an in-progress draft (`kind`/`rules`) not yet saved — the admin UI's rule builder wants a live preview before the mapping is valid enough to save. */
  fieldMappingId?: string;
  kind?: string;
  rules?: readonly MappingRuleInput[];
  /** The target schema to validate the mapped record against, once produced. Required for a draft run; taken from the saved mapping when `fieldMappingId` is given. */
  schemaName?: string;
  /** A raw JSON payload string, mutually exclusive with `hookDeliveryId`. */
  samplePayload?: string;
  /** Prefills the sample from an already-queued hook delivery's raw payload (KAN-53), read-only — the delivery's status is never changed by a test-run. */
  hookDeliveryId?: string;
}

export interface TestRunFieldMappingResult extends MappingApplyResult {
  /** Envelope-level problems (`ingest.service.ts`'s `checkRecordEnvelope`) in the mapped record, e.g. a required top-level field ended up empty. Only checked once `errors` (mapping-level) is empty, since a record with unmapped fields can't meaningfully be envelope-checked yet. */
  envelopeErrors: readonly string[];
  /** Whether the target schema currently has an active version to validate against. */
  schemaRegistered: boolean;
  /** Field-level violations against the target schema's registered fields, once the record passed its envelope check. */
  schemaValidationErrors: readonly string[];
}

/**
 * The shared core of both `testRunFieldMapping` and `applyFieldMappingToDelivery`: parse a sample
 * payload, run it through the mapping engine, then the same envelope/schema validators
 * `ingest.service.ts` itself uses — so a preview and a real apply can never silently disagree about
 * whether a record is valid. Never persists anything on its own; `applyFieldMappingToDelivery` is
 * the only caller that goes on to actually ingest a clean result.
 */
async function runFieldMapping(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind & MappingRecordKind,
  rules: readonly MappingRule[],
  schemaName: string,
  samplePayloadText: string,
): Promise<TestRunFieldMappingResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(samplePayloadText);
  } catch {
    throw new InvalidSamplePayloadError();
  }

  const applied = applyFieldMapping(rules, payload);
  if (applied.errors.length > 0) {
    return { ...applied, envelopeErrors: [], schemaRegistered: false, schemaValidationErrors: [] };
  }

  const { fieldsToValidate, envelopeReasons } = checkRecordEnvelope(kind, applied.record);
  if (envelopeReasons.length > 0) {
    return { ...applied, envelopeErrors: envelopeReasons, schemaRegistered: false, schemaValidationErrors: [] };
  }

  const activeSchema = await getActiveSchemaDefinition(organizationId, projectId, kind, schemaName);
  if (!activeSchema) {
    return { ...applied, envelopeErrors: [], schemaRegistered: false, schemaValidationErrors: [] };
  }

  const schemaValidationErrors = validateAgainstSchema(fieldsToValidate, activeSchema.field_defs, kind);
  return { ...applied, envelopeErrors: [], schemaRegistered: true, schemaValidationErrors };
}

/**
 * Runs a mapping (saved or draft) against one sample payload without
 * persisting anything (KAN-54 AC: "test-run on sample"). Reuses
 * `ingest.service.ts`'s own envelope/schema validators (via {@link runFieldMapping}) so a test-run
 * shows exactly what would happen if the mapped record were actually ingested, without requiring a
 * real ingest call.
 */
export async function testRunFieldMapping(params: TestRunFieldMappingParams): Promise<TestRunFieldMappingResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  let kind: SchemaDefKind & MappingRecordKind;
  let rules: MappingRule[];
  let schemaName: string;

  if (params.fieldMappingId) {
    const mapping = await loadFieldMapping(params.organizationId, params.projectId, params.fieldMappingId);
    kind = requireMappingKind(mapping.kind);
    rules = mapping.rules;
    schemaName = mapping.schema_name;
  } else {
    kind = requireMappingKind(params.kind ?? '');
    const validated = validateMappingRules(kind, params.rules ?? []);
    if (validated.reasons.length > 0) {
      throw new InvalidFieldMappingError(validated.reasons);
    }
    rules = validated.rules;
    schemaName = (params.schemaName ?? '').trim();
    if (schemaName.length === 0) {
      throw new InvalidFieldMappingError(['A test run requires a target schema name.']);
    }
  }

  let samplePayloadText: string;
  if (params.hookDeliveryId) {
    const delivery = await getHookDeliveryForProject(params.organizationId, params.projectId, params.hookDeliveryId);
    samplePayloadText = delivery.raw_payload;
  } else {
    samplePayloadText = params.samplePayload ?? '';
  }

  return runFieldMapping(params.organizationId, params.projectId, kind, rules, schemaName, samplePayloadText);
}

export interface ApplyFieldMappingToDeliveryParams {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  hookDeliveryId: string;
  actorId: string;
}

export interface ApplyFieldMappingToDeliveryResult extends TestRunFieldMappingResult {
  /**
   * Whether the mapped record actually landed via the ingest pipeline. `false` means the same kind
   * of problem a test-run would have shown (see the inherited `errors`/`envelopeErrors`/
   * `schemaValidationErrors`) blocked it — nothing was persisted and the delivery is untouched.
   */
  applied: boolean;
  /** Only set when `applied` is `true` — the batch this delivery's mapped record landed in (KAN-32/33), with its accept/quarantine/duplicate outcome. */
  ingestSummary?: IngestBatchSummary;
}

/**
 * Closes KAN-54's own follow-up gap: `testRunFieldMapping` only ever previews a mapping — nothing
 * in this codebase actually consumed a saved mapping against a real queued delivery (KAN-53) and
 * landed it through the ingest pipeline (KAN-32/33). Runs the exact same mapping/validation path
 * `testRunFieldMapping` exercises (shared via {@link runFieldMapping}, not re-derived) and, only
 * once that comes back clean, feeds the mapped record through `ingestBatch` as a real one-record
 * batch — the same accept/quarantine/dedup path a direct `POST /v1/ingest/...` call goes through,
 * so a mapped delivery is indistinguishable from a record a client sent straight to the ingest API.
 *
 * A disabled mapping or a discarded delivery both refuse outright (a human turned one of them off
 * on purpose). A delivery that was already applied refuses too — `applied_at` is set once,
 * permanently, the same "immediate and final" posture `ApiKeyModel.revoked_at`/
 * `HookEndpointModel.disabled_at` take for their own presence-means-done fields — since re-running
 * an already-landed delivery through `ingestBatch` a second time would only ever produce a
 * confusing `duplicate` outcome (dedup keys make it harmless, not meaningful).
 */
export async function applyFieldMappingToDelivery(params: ApplyFieldMappingToDeliveryParams): Promise<ApplyFieldMappingToDeliveryResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const mapping = await loadFieldMapping(params.organizationId, params.projectId, params.fieldMappingId);
  if (mapping.disabled_at) {
    throw new FieldMappingDisabledError();
  }
  const delivery = await getHookDeliveryForProject(params.organizationId, params.projectId, params.hookDeliveryId);
  if (delivery.status === 'discarded') {
    throw new HookDeliveryDiscardedError();
  }
  if (delivery.applied_at) {
    throw new HookDeliveryAlreadyAppliedError();
  }

  const kind = requireMappingKind(mapping.kind);
  const result = await runFieldMapping(params.organizationId, params.projectId, kind, mapping.rules, mapping.schema_name, delivery.raw_payload);

  const isValid = result.errors.length === 0 && result.envelopeErrors.length === 0 && result.schemaRegistered && result.schemaValidationErrors.length === 0;
  if (!isValid) {
    return { ...result, applied: false };
  }

  const input: IngestBatchInput =
    kind === 'event'
      ? { kind: 'event', records: [result.record] }
      : kind === 'entity'
        ? { kind: 'entity', type: mapping.schema_name, records: [result.record] }
        : { kind: 'measure', records: [result.record] };

  const summary = await ingestBatch({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: mapping.environment_id,
    input,
  });

  const now = new Date().toISOString();
  delivery.status = 'reviewed';
  delivery.reviewed_at = now;
  delivery.reviewed_by = params.actorId;
  delivery.applied_at = now;
  delivery.applied_by = params.actorId;
  delivery.applied_field_mapping_id = mapping.id;
  delivery.applied_batch_id = summary.batchId;
  await delivery.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: mapping.environment_id,
      actorType: 'user',
      actorId: params.actorId,
      action: 'field_mapping.apply_to_delivery',
      targetType: 'hook_delivery',
      targetId: delivery.id,
      summary: `Applied field mapping "${mapping.name}" to a hook delivery: batch ${summary.batchId} (${summary.accepted} accepted, ${summary.quarantined} quarantined, ${summary.duplicates} duplicate)`,
      after: {
        fieldMappingId: mapping.id,
        batchId: summary.batchId,
        accepted: summary.accepted,
        quarantined: summary.quarantined,
        duplicates: summary.duplicates,
      },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return { ...result, applied: true, ingestSummary: summary };
}

export interface SuggestFieldMappingRulesParams {
  organizationId: string;
  projectId: string;
  kind: string;
  /** The target schema (must already have an active version, same requirement `createFieldMapping` enforces) to build the candidate target-field list from. */
  schemaName: string;
  samplePayload: string;
}

export interface SuggestFieldMappingRulesResult {
  suggestions: readonly MappingSuggestion[];
}

/**
 * Proposes a `rename`/`cast` rule for each of the target schema's fields it can confidently match
 * from one sample payload (KAN-55 AC: "LLM proposes field mapping from sample payload; user
 * confirms"). Nothing is saved or applied here — the admin UI lets the user review, edit, and drop
 * suggestions before adding them to the mapping form's own rule list, so the "user confirms" half of
 * the AC lives entirely client-side.
 *
 * The proposer itself (`suggestFieldMappingRules`, `@growthos/shared`) is a deterministic
 * name/type-similarity heuristic — a buildable-today stand-in for a real LLM call, the same
 * "provider-agnostic, real backend deferred" posture `NotConfiguredWarehouseQueryExecutor` (KAN-42)
 * and `LocalKmsProvider` (KAN-29) establish for their own external dependencies — since this
 * function's own contract (sample payload + target schema in, ranked suggestions out) wouldn't
 * change if a real LLM-backed proposer replaced it later.
 */
export async function suggestFieldMappingRules(params: SuggestFieldMappingRulesParams): Promise<SuggestFieldMappingRulesResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const kind = requireMappingKind(params.kind);
  const schemaName = params.schemaName.trim();
  if (schemaName.length === 0) {
    throw new InvalidFieldMappingError(['A suggestion request requires a non-empty target schema name.']);
  }

  const activeSchema = await getActiveSchemaDefinition(params.organizationId, params.projectId, kind, schemaName);
  if (!activeSchema) {
    throw new TargetSchemaNotRegisteredError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(params.samplePayload);
  } catch {
    throw new InvalidSamplePayloadError();
  }

  const targetFields = mappingTargetFields(kind, activeSchema.field_defs);
  const suggestions = suggestMappingRulesFromSample(targetFields, payload);
  return { suggestions };
}

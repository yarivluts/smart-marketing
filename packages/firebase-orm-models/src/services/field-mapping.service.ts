import {
  applyFieldMapping,
  validateMappingRules,
  type MappingApplyResult,
  type MappingRecordKind,
  type MappingRule,
  type MappingRuleInput,
} from '@growthos/shared';
import { EnvironmentModel } from '../models/environment.model';
import { FieldMappingModel } from '../models/field-mapping.model';
import { HookEndpointModel } from '../models/hook-endpoint.model';
import { ProjectModel } from '../models/project.model';
import { isSchemaDefKind, type SchemaDefKind } from '../models/schema-def.model';
import { checkRecordEnvelope, validateAgainstSchema } from './ingest.service';
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
  const name = params.name.trim();
  const schemaName = params.schemaName.trim();
  if (name.length === 0) {
    throw new InvalidFieldMappingError(['A mapping must have a non-empty name.']);
  }
  if (schemaName.length === 0) {
    throw new InvalidFieldMappingError(['A mapping must target a non-empty schema name.']);
  }

  const { rules, reasons } = validateMappingRules(kind, params.rules);
  if (reasons.length > 0) {
    throw new InvalidFieldMappingError(reasons);
  }

  if (params.hookEndpointId) {
    const endpoint = await HookEndpointModel.init(params.hookEndpointId, {
      organization_id: params.organizationId,
      project_id: params.projectId,
    });
    if (!endpoint || endpoint.organization_id !== params.organizationId || endpoint.project_id !== params.projectId) {
      throw new InvalidFieldMappingError(['hookEndpointId does not refer to a hook endpoint in this project.']);
    }
  }

  const activeSchema = await getActiveSchemaDefinition(params.organizationId, params.projectId, kind, schemaName);
  if (!activeSchema) {
    throw new TargetSchemaNotRegisteredError();
  }

  const mapping = new FieldMappingModel();
  mapping.organization_id = params.organizationId;
  mapping.project_id = params.projectId;
  mapping.environment_id = params.environmentId;
  if (params.hookEndpointId) {
    mapping.hook_endpoint_id = params.hookEndpointId;
  }
  mapping.name = name;
  mapping.kind = kind;
  mapping.schema_name = schemaName;
  mapping.rules = rules;
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
 * Runs a mapping (saved or draft) against one sample payload without
 * persisting anything (KAN-54 AC: "test-run on sample"). Reuses
 * `ingest.service.ts`'s own envelope/schema validators so a test-run shows
 * exactly what would happen if the mapped record were actually ingested,
 * without requiring a real ingest call.
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

  const activeSchema = await getActiveSchemaDefinition(params.organizationId, params.projectId, kind, schemaName);
  if (!activeSchema) {
    return { ...applied, envelopeErrors: [], schemaRegistered: false, schemaValidationErrors: [] };
  }

  const schemaValidationErrors = validateAgainstSchema(fieldsToValidate, activeSchema.field_defs);
  return { ...applied, envelopeErrors: [], schemaRegistered: true, schemaValidationErrors };
}

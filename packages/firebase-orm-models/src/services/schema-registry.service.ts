import { ProjectModel } from '../models/project.model';
import {
  isSchemaDefKind,
  isSchemaFieldType,
  SchemaDefModel,
  type SchemaDefKind,
  type SchemaFieldDef,
} from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';

export class InvalidSchemaDefinitionError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid schema definition: ${reasons.join('; ')}`);
    this.name = 'InvalidSchemaDefinitionError';
  }
}

export class DuplicateSchemaDefinitionError extends Error {
  constructor() {
    super(
      'A schema with this kind and name is already registered in this project. Evolve it instead of registering it again.',
    );
    this.name = 'DuplicateSchemaDefinitionError';
  }
}

export class SchemaDefNotFoundError extends Error {
  constructor() {
    super('No schema is registered for this kind and name in this project yet. Register it first.');
    this.name = 'SchemaDefNotFoundError';
  }
}

export class BreakingSchemaChangeError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(`Breaking schema change rejected: ${violations.join('; ')}`);
    this.name = 'BreakingSchemaChangeError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** Caller-facing shape for one field before it's validated into a `SchemaFieldDef`. */
export interface SchemaFieldInput {
  name: string;
  type: string;
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

function validateFields(fields: readonly SchemaFieldInput[]): SchemaFieldDef[] {
  const reasons: string[] = [];
  if (fields.length === 0) {
    reasons.push('A schema must declare at least one field.');
  }

  const seen = new Set<string>();
  for (const field of fields) {
    const name = field.name.trim();
    if (name.length === 0) {
      reasons.push('Every field must have a non-empty name.');
      continue;
    }
    if (seen.has(name)) {
      reasons.push(`Field "${name}" is declared more than once.`);
    }
    seen.add(name);
    if (!isSchemaFieldType(field.type)) {
      reasons.push(`Field "${name}" has an unknown type "${field.type}".`);
    }
  }

  if (reasons.length > 0) {
    throw new InvalidSchemaDefinitionError(reasons);
  }

  return fields.map((field) => ({
    name: field.name.trim(),
    type: field.type as SchemaFieldDef['type'],
    is_required: field.isRequired,
    is_pii: field.isPii,
    is_identity_key: field.isIdentityKey,
  }));
}

async function listVersions(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel[]> {
  const versions = await SchemaDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('kind', '==', kind)
    .where('name', '==', name)
    .get();
  return versions.sort((a, b) => a.version - b.version);
}

/**
 * Non-breaking evolution rule (KAN-31 AC: "breaking change rejected"). Every
 * field present in the previous version must still exist in the next one,
 * keep its `type`, never go from optional to required, and never lose
 * `is_identity_key` once granted — identity stitching (plan `08 §1`) depends
 * on a registered identity key staying put across versions. A brand new
 * field is only non-breaking if it's optional: a new *required* field would
 * invalidate every payload already shaped for the previous version.
 */
function findBreakingChanges(previous: readonly SchemaFieldDef[], next: readonly SchemaFieldDef[]): string[] {
  const violations: string[] = [];
  const previousByName = new Map(previous.map((field) => [field.name, field]));
  const nextByName = new Map(next.map((field) => [field.name, field]));

  for (const [name, prevField] of previousByName) {
    const nextField = nextByName.get(name);
    if (!nextField) {
      violations.push(`Field "${name}" was removed.`);
      continue;
    }
    if (nextField.type !== prevField.type) {
      violations.push(`Field "${name}" changed type from "${prevField.type}" to "${nextField.type}".`);
    }
    if (!prevField.is_required && nextField.is_required) {
      violations.push(`Field "${name}" became required; it was optional in the previous version.`);
    }
    if (prevField.is_identity_key && !nextField.is_identity_key) {
      violations.push(`Field "${name}" is no longer marked as an identity key.`);
    }
  }

  for (const [name, nextField] of nextByName) {
    if (!previousByName.has(name) && nextField.is_required) {
      violations.push(`New field "${name}" cannot be required in a non-breaking evolution.`);
    }
  }

  return violations;
}

export interface RegisterSchemaDefinitionParams {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
  createdByUserId: string;
}

/** Registers the first version (v1) of a new entity/event/measure schema in a project (KAN-31 AC: "register v1"). */
export async function registerSchemaDefinition(params: RegisterSchemaDefinitionParams): Promise<SchemaDefModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  if (!isSchemaDefKind(params.kind)) {
    throw new InvalidSchemaDefinitionError([`Unknown schema kind "${params.kind}".`]);
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new InvalidSchemaDefinitionError(['A schema must have a non-empty name.']);
  }
  const fields = validateFields(params.fields);

  const existing = await listVersions(params.organizationId, params.projectId, params.kind, name);
  if (existing.length > 0) {
    throw new DuplicateSchemaDefinitionError();
  }

  const schemaDef = new SchemaDefModel();
  schemaDef.organization_id = params.organizationId;
  schemaDef.project_id = params.projectId;
  schemaDef.kind = params.kind;
  schemaDef.name = name;
  schemaDef.version = 1;
  schemaDef.status = 'active';
  schemaDef.field_defs = fields;
  schemaDef.created_by = params.createdByUserId;
  schemaDef.created_at = new Date().toISOString();
  schemaDef.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await schemaDef.save();
  return schemaDef;
}

export interface EvolveSchemaDefinitionParams {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
  createdByUserId: string;
}

/**
 * Registers the next version of an already-registered schema (KAN-31 AC:
 * "evolve to v2 -> both queryable; breaking change rejected"). The previous
 * version's document is kept as-is — only its `status` flips to
 * `superseded` — rather than deleted or mutated in place, so both versions
 * remain independently queryable, the same "immutable version history"
 * reasoning as `ResourceTemplateModel`'s version-pin, just applied to every
 * version instead of only the latest.
 */
export async function evolveSchemaDefinition(params: EvolveSchemaDefinitionParams): Promise<SchemaDefModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  if (!isSchemaDefKind(params.kind)) {
    throw new InvalidSchemaDefinitionError([`Unknown schema kind "${params.kind}".`]);
  }
  const name = params.name.trim();
  const fields = validateFields(params.fields);

  const versions = await listVersions(params.organizationId, params.projectId, params.kind, name);
  const previous = versions.at(-1);
  if (!previous) {
    throw new SchemaDefNotFoundError();
  }

  const violations = findBreakingChanges(previous.field_defs, fields);
  if (violations.length > 0) {
    throw new BreakingSchemaChangeError(violations);
  }

  previous.status = 'superseded';
  await previous.save();

  const next = new SchemaDefModel();
  next.organization_id = params.organizationId;
  next.project_id = params.projectId;
  next.kind = params.kind;
  next.name = name;
  next.version = previous.version + 1;
  next.status = 'active';
  next.field_defs = fields;
  next.created_by = params.createdByUserId;
  next.created_at = new Date().toISOString();
  next.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await next.save();
  return next;
}

/** Every version of every schema family in a project — the admin browse view ("both queryable"). */
export async function listSchemaDefinitionsForProject(
  organizationId: string,
  projectId: string,
): Promise<SchemaDefModel[]> {
  const defs = await SchemaDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return defs.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.version - b.version,
  );
}

/** Every version of one schema family (kind+name), oldest first — used by an evolve form to prefill the latest version's fields. */
export async function listSchemaDefinitionVersions(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel[]> {
  return listVersions(organizationId, projectId, kind, name);
}

/** The current `active` version of one schema family, or `null` if it's never been registered — the shape a future ingest validator (KAN-32) would consume. */
export async function getActiveSchemaDefinition(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel | null> {
  const versions = await listVersions(organizationId, projectId, kind, name);
  return versions.find((version) => version.status === 'active') ?? null;
}

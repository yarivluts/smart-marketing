import { ProjectModel } from '../models/project.model';
import {
  isSchemaDefKind,
  isSchemaFieldType,
  SchemaDefModel,
  type SchemaDefKind,
  type SchemaFieldDef,
} from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

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

/** Cheap existence check for `registerSchemaDefinition` — a `.limit(1)` query instead of fetching every version just to check `.length > 0`. */
async function schemaFamilyHasAnyVersion(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<boolean> {
  const matches = await SchemaDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('kind', '==', kind)
    .where('name', '==', name)
    .limit(1)
    .get();
  return matches.length > 0;
}

/** The one `active` version of a schema family, queried directly instead of fetching the full version history just to find it. Shared by `evolveSchemaDefinition` and `getActiveSchemaDefinition`. */
async function findActiveVersion(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel | undefined> {
  const matches = await SchemaDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('kind', '==', kind)
    .where('name', '==', name)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return matches[0];
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

interface SchemaDefRequest {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
}

/** Shared kind/name/fields validation for register and evolve — keeps the two entry points from silently drifting (evolve previously skipped the empty-name check register enforced). */
async function validateSchemaDefRequest(
  request: SchemaDefRequest,
): Promise<{ kind: SchemaDefKind; name: string; fields: SchemaFieldDef[] }> {
  await requireProjectInOrg(request.organizationId, request.projectId);

  if (!isSchemaDefKind(request.kind)) {
    throw new InvalidSchemaDefinitionError([`Unknown schema kind "${request.kind}".`]);
  }
  const name = request.name.trim();
  if (name.length === 0) {
    throw new InvalidSchemaDefinitionError(['A schema must have a non-empty name.']);
  }
  const fields = validateFields(request.fields);

  return { kind: request.kind, name, fields };
}

interface BuildSchemaDefVersionParams {
  organizationId: string;
  projectId: string;
  kind: SchemaDefKind;
  name: string;
  version: number;
  fields: SchemaFieldDef[];
  createdByUserId: string;
}

/** Constructs one `active` version document — shared by register (v1) and evolve (v{n+1}) so a future field addition can't land on only one of the two paths. */
function buildSchemaDefVersion(params: BuildSchemaDefVersionParams): SchemaDefModel {
  const schemaDef = new SchemaDefModel();
  schemaDef.organization_id = params.organizationId;
  schemaDef.project_id = params.projectId;
  schemaDef.kind = params.kind;
  schemaDef.name = params.name;
  schemaDef.version = params.version;
  schemaDef.status = 'active';
  schemaDef.field_defs = params.fields;
  schemaDef.created_by = params.createdByUserId;
  schemaDef.created_at = new Date().toISOString();
  schemaDef.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  return schemaDef;
}

export interface RegisterSchemaDefinitionParams {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
  createdByUserId: string;
}

/**
 * Registers the first version (v1) of a new entity/event/measure schema in a
 * project (KAN-31 AC: "register v1"). Not transactional: two concurrent
 * registrations for the same (kind, name) can both pass the existence check
 * before either writes, producing two "v1 active" documents for one family.
 * This package's own convention (see `firestore-connection.ts`'s doc
 * comment) reserves raw Firestore SDK access — which a transaction would
 * require — to that one file, so a proper fix is a bigger change than this
 * story; flagged here as a known, deliberately-deferred gap rather than
 * papered over.
 */
export async function registerSchemaDefinition(params: RegisterSchemaDefinitionParams): Promise<SchemaDefModel> {
  const { kind, name, fields } = await validateSchemaDefRequest(params);

  const alreadyExists = await schemaFamilyHasAnyVersion(params.organizationId, params.projectId, kind, name);
  if (alreadyExists) {
    throw new DuplicateSchemaDefinitionError();
  }

  const schemaDef = buildSchemaDefVersion({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind,
    name,
    version: 1,
    fields,
    createdByUserId: params.createdByUserId,
  });
  await schemaDef.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'schema_def.register',
      targetType: 'schema_def',
      targetId: schemaDef.id,
      summary: `Registered schema "${schemaDef.kind}:${schemaDef.name}" v${schemaDef.version}`,
      after: { fieldDefs: schemaDef.field_defs },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful registration into a failure for the caller.
  }

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
 *
 * Not transactional, for the same reason documented on
 * `registerSchemaDefinition`: two concurrent evolutions of the same family
 * can both read the same "previous" active version, both pass the
 * breaking-change check, and both write a document claiming the next
 * version number — a known, deliberately-deferred gap.
 */
export async function evolveSchemaDefinition(params: EvolveSchemaDefinitionParams): Promise<SchemaDefModel> {
  const { kind, name, fields } = await validateSchemaDefRequest(params);

  const previous = await findActiveVersion(params.organizationId, params.projectId, kind, name);
  if (!previous) {
    throw new SchemaDefNotFoundError();
  }

  const violations = findBreakingChanges(previous.field_defs, fields);
  if (violations.length > 0) {
    throw new BreakingSchemaChangeError(violations);
  }

  previous.status = 'superseded';
  const next = buildSchemaDefVersion({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind,
    name,
    version: previous.version + 1,
    fields,
    createdByUserId: params.createdByUserId,
  });

  await Promise.all([previous.save(), next.save()]);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'schema_def.evolve',
      targetType: 'schema_def',
      targetId: next.id,
      summary: `Evolved schema "${next.kind}:${next.name}" to v${next.version}`,
      before: { fieldDefs: previous.field_defs, version: previous.version },
      after: { fieldDefs: next.field_defs, version: next.version },
    });
  } catch {
    // Best-effort — see the comment in registerSchemaDefinition above.
  }

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

/**
 * The full version history of one schema family (kind+name), oldest first.
 * Not currently called by any route or page — `apps/web`'s evolve form
 * instead prefills from the project-wide list it already fetched
 * (`listSchemaDefinitionsForProject`) — exposed for a future per-family
 * version-history view.
 */
export async function listSchemaDefinitionVersions(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel[]> {
  return listVersions(organizationId, projectId, kind, name);
}

/**
 * Every distinct schema `name` with an `active` version for one `kind` —
 * e.g. every event schema currently in force, for a per-event volume/alerting
 * surface (KAN-36). Derived from an already-fetched `listSchemaDefinitionsForProject`
 * result rather than issuing a second Firestore query, the same "derive
 * view-side from data already fetched" posture `deriveCurrentFreshness`
 * (KAN-38) uses.
 */
export function activeSchemaNamesForKind(defs: readonly SchemaDefModel[], kind: SchemaDefKind): string[] {
  return [...new Set(defs.filter((def) => def.kind === kind && def.status === 'active').map((def) => def.name))].sort();
}

/** The current `active` version of one schema family, or `null` if it's never been registered — the shape a future ingest validator (KAN-32) would consume. */
export async function getActiveSchemaDefinition(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  name: string,
): Promise<SchemaDefModel | null> {
  const active = await findActiveVersion(organizationId, projectId, kind, name);
  return active ?? null;
}

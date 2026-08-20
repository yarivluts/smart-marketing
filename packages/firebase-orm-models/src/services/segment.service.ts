import { isSegmentFilterOperator, isValidSegmentFilterCondition, type SegmentFilterCondition } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { SegmentModel } from '../models/segment.model';
import type { SchemaFieldType } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveSchemaDefinition } from './schema-registry.service';
import { resolveDefaultQueryEnvironment } from './organization.service';
import { escapeLikePattern } from './mcp-tools.service';
import { runQuotaGatedWarehouseQuery, ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { defaultWarehouseQueryExecutor, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor } from '../warehouse/query-executor';

export class InvalidSegmentError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid segment: ${reasons.join('; ')}`);
    this.name = 'InvalidSegmentError';
  }
}

export class SegmentNotFoundError extends Error {
  constructor() {
    super('No segment with this id exists in this project.');
    this.name = 'SegmentNotFoundError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface CreateSegmentParams {
  organizationId: string;
  projectId: string;
  name: string;
  schemaName: string;
  filters: readonly unknown[];
  createdByUserId: string;
  /** Defaults to `'user'` — set to `'api_key'` when the caller authenticated with a machine key (KAN-76's MCP `create_segment` tool) rather than a human, so the audit trail doesn't mislabel a key as a user. */
  createdByActorType?: 'user' | 'api_key';
}

/**
 * Creates a segment (KAN-76, E22.2): validates the name, that `schemaName`
 * is a registered+active `entity`-kind schema in this project, and every
 * filter condition's shape — collecting every problem before throwing,
 * mirroring `createGoal`'s own "collect all reasons, don't fail fast"
 * convention.
 */
export async function createSegment(params: CreateSegmentParams): Promise<SegmentModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];

  const name = params.name.trim();
  if (name.length === 0) {
    reasons.push('A segment must have a non-empty name.');
  }

  if (params.filters.length === 0) {
    reasons.push('A segment requires at least one filter condition.');
  }
  const validFilters: SegmentFilterCondition[] = [];
  params.filters.forEach((filter, index) => {
    if (isValidSegmentFilterCondition(filter)) {
      validFilters.push(filter);
    } else {
      reasons.push(`Filter at index ${index} is invalid — expected { field: string, op: one of ${['=', '!=', '>', '>=', '<', '<=', 'contains'].join(', ')}, value: string|number|boolean }.`);
    }
  });

  const schemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'entity', params.schemaName);
  if (!schemaDef) {
    reasons.push(`Entity schema "${params.schemaName}" is not registered (or not active) in this project.`);
  }

  if (reasons.length > 0) {
    throw new InvalidSegmentError(reasons);
  }

  const now = new Date().toISOString();
  const segment = new SegmentModel();
  segment.organization_id = params.organizationId;
  segment.project_id = params.projectId;
  segment.name = name;
  segment.schema_name = params.schemaName;
  segment.filters = validFilters;
  segment.created_by = params.createdByUserId;
  segment.created_at = now;
  segment.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await segment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.createdByActorType ?? 'user',
      actorId: params.createdByUserId,
      action: 'segment.create',
      targetType: 'segment',
      targetId: segment.id,
      summary: `Created segment "${segment.name}"`,
      after: { schemaName: segment.schema_name, filters: segment.filters },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return segment;
}

/** Every segment in a project, newest-first — a saved definition has no inherent ordering the way a goal's deadline does. */
export async function listSegmentsForProject(organizationId: string, projectId: string): Promise<SegmentModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const segments = await SegmentModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return segments.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** The segment's own doc, scoped and existence-checked — the same `.init` + field-match pattern `board.service.ts`'s `loadBoard` uses for its own project-child lookup. */
async function loadSegment(organizationId: string, projectId: string, segmentId: string): Promise<SegmentModel> {
  const segment = await SegmentModel.init(segmentId, { organization_id: organizationId, project_id: projectId });
  if (!segment || segment.organization_id !== organizationId || segment.project_id !== projectId) {
    throw new SegmentNotFoundError();
  }
  return segment;
}

/** Deletes a segment outright — disposable saved config, the same posture `deleteGoal`/`deleteBoard`/`deleteWinRule` document for their own siblings. Still audit-logged like every other lifecycle change in this file (KAN-44 AC: "every config ... change"). */
export async function deleteSegment(organizationId: string, projectId: string, segmentId: string, deletedByUserId: string): Promise<void> {
  const segment = await loadSegment(organizationId, projectId, segmentId);
  await segment.delete();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: deletedByUserId,
      action: 'segment.delete',
      targetType: 'segment',
      targetId: segmentId,
      summary: `Deleted segment "${segment.name}"`,
    });
  } catch {
    // Best-effort — audit logging must never turn a successful delete into a failure for the caller.
  }
}

/** Same identifier-safety posture `packages/shared`'s metrics compiler applies to every compiled column reference (`assertSafeIdentifier`) — a segment's filter `field` is user-supplied and gets spliced directly into the JSON-subscript expression below, so only letters/digits/underscores are allowed through. */
const SAFE_SEGMENT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeSegmentFieldName(field: string): string {
  if (!SAFE_SEGMENT_FIELD_PATTERN.test(field)) {
    throw new InvalidSegmentError([`Unsafe filter field "${field}" — only letters, digits, and underscores are allowed, and it must start with a letter or underscore.`]);
  }
  return field;
}

/** The BigQuery JSON-extraction expression for one filter field, typed by the field's declared schema type (defaulting to a plain string extraction when the field isn't found on the active schema — e.g. a segment saved against a field an evolution later dropped). Mirrors `dbt/macros/cross_database.sql`'s `bigquery__json_text_field` convention (`LAX_STRING` over the JSON subscript operator) but adds the `LAX_FLOAT64`/`LAX_BOOL` typed variants a segment's `>`/`>=`/`<`/`<=` numeric filters and boolean-field equality checks need. */
function jsonFieldExtraction(fieldName: string, fieldType: SchemaFieldType | undefined): string {
  const safeField = assertSafeSegmentFieldName(fieldName);
  if (fieldType === 'number') {
    return `LAX_FLOAT64(properties['${safeField}'])`;
  }
  if (fieldType === 'boolean') {
    return `LAX_BOOL(properties['${safeField}'])`;
  }
  return `LAX_STRING(properties['${safeField}'])`;
}

/** Compiles one saved filter condition into a `WHERE`-clause fragment plus its own bound parameter(s) — mirroring `mcp-tools.service.ts`'s hand-written-SQL-over-a-`WarehouseQueryExecutor` convention, since a segment's filters (unlike a metric's) run against the JSON `properties` column rather than a typed fact-table column. `contains` always compares as text (a `LIKE`, wildcard-escaped the same way `searchProjectCustomers` escapes its own search term); every other operator casts the bound parameter to the field's declared type first, since every parameter this executor abstraction accepts is a plain string (`CompilerParamValue`) and BigQuery infers a `STRING` parameter's type from the value it's given, not from how the SQL uses it. */
function emitSegmentFilterClause(condition: SegmentFilterCondition, paramName: string, fieldType: SchemaFieldType | undefined, params: Record<string, string>): string {
  if (!isSegmentFilterOperator(condition.op)) {
    throw new InvalidSegmentError([`Unknown filter operator "${condition.op}" on "${condition.field}".`]);
  }

  if (condition.op === 'contains') {
    params[paramName] = `%${escapeLikePattern(String(condition.value))}%`;
    return `LAX_STRING(properties['${assertSafeSegmentFieldName(condition.field)}']) LIKE @${paramName}`;
  }

  const extraction = jsonFieldExtraction(condition.field, fieldType);
  params[paramName] = String(condition.value);
  const boundValue = fieldType === 'number' ? `SAFE_CAST(@${paramName} AS FLOAT64)` : fieldType === 'boolean' ? `SAFE_CAST(@${paramName} AS BOOL)` : `@${paramName}`;
  return `${extraction} ${condition.op} ${boundValue}`;
}

export interface CountSegmentMembersParams {
  organizationId: string;
  projectId: string;
  segmentId: string;
  /** Same semantics as `mcp-tools.service.ts`'s `SearchProjectCustomersParams.environmentId` — omit to resolve the project's `prod` default server-side. */
  environmentId?: string;
  /** Defaults to `defaultWarehouseQueryExecutor` — overridable so tests can inject a fake executor without a real warehouse, the same convention `queryMetrics`/`searchProjectCustomers` establish. */
  executor?: WarehouseQueryExecutor;
}

/** Mirrors `GoalProgressOutcome`/`BoardTileQueryOutcome`'s exact shape and reason vocabulary — a segment's member-count badge degrades on the segments page the same way a goal thermometer or board tile does, rather than crashing the page, for the same expected-not-buggy failure modes (no warehouse yet, the project's spent its daily query quota, or the warehouse rejected the query). Since KAN-39's quota guardrail was wired into this whole hand-written-SQL family (`runQuotaGatedWarehouseQuery` — also used by `searchProjectCustomers`/`queryProjectCohortRetention`/`queryProjectFunnelSteps`), `quota_exceeded` degrades the same way `queryBoardTile`/`queryGoalProgress` already do rather than throwing outright — the segments page can't "fail the whole page" the way an MCP tool call can just error out. */
export type SegmentMemberCountOutcome =
  | { ok: true; count: number }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

/**
 * Counts how many `entities` rows (KAN-37's canonical current-state table)
 * currently match a saved segment's own schema + ANDed filter conditions —
 * the "live member count" `segment-filter.ts`'s own doc comment flagged as
 * missing ("no query executor reads this shape yet"). Follows the exact
 * hand-written-SQL-over-`WarehouseQueryExecutor` pattern `mcp-tools.service.ts`
 * already established three times over (`searchProjectCustomers`/
 * `queryProjectCohortRetention`/`queryProjectFunnelSteps`), but — since this
 * one backs a page's own member-count badge rather than an MCP tool call
 * that can just fail outright — wraps the execution the way
 * `queryBoardTile`/`queryGoalProgress` do, so an unconfigured/rejecting
 * warehouse degrades the badge instead of crashing the segments page.
 */
export async function countSegmentMembers(params: CountSegmentMembersParams): Promise<SegmentMemberCountOutcome> {
  const segment = await loadSegment(params.organizationId, params.projectId, params.segmentId);
  const schemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'entity', segment.schema_name);
  const fieldTypeByName = new Map((schemaDef?.field_defs ?? []).map((field) => [field.name, field.type]));

  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId', 'schema_name = @schemaName'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
    schemaName: segment.schema_name,
  };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }
  segment.filters.forEach((condition, index) => {
    filters.push(emitSegmentFilterClause(condition, `filter_${index}`, fieldTypeByName.get(condition.field), queryParams));
  });

  const sql = `SELECT COUNT(*) AS member_count FROM entities WHERE ${filters.join(' AND ')}`;
  try {
    const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'count_segment_members' }, () =>
      executor.execute({ sql, params: queryParams }),
    );
    return { ok: true, count: Number(rows[0]?.member_count ?? 0) };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    if (error instanceof WarehouseQueryFailedError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}

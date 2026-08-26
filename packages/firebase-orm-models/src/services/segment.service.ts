import {
  DEMO_EVENT_SCHEMA_NAME,
  isSegmentFilterOperator,
  isSegmentWorkListStatus,
  isValidSegmentEventCondition,
  isValidSegmentFilterCondition,
  suggestSegmentCandidates,
  type SegmentEventCondition,
  type SegmentFilterCondition,
  type SegmentSuggestion,
  type SegmentWorkListStatus,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { SegmentModel } from '../models/segment.model';
import { OrgPersonModel } from '../models/org-person.model';
import type { SchemaFieldType } from '../models/schema-def.model';
import { STRIPE_SUBSCRIPTION_ENTITY_NAME } from '../plugin-runtime/stripe/schemas';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveSchemaDefinition } from './schema-registry.service';
import { resolveDefaultQueryEnvironment } from './organization.service';
import { escapeLikePattern, parseJsonColumn } from './mcp-tools.service';
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
  /**
   * Cross-schema conditions (KAN-93) — "has (or has never had) a matching
   * event in some other registered event schema", e.g. the plan's own
   * "paying_no_demo" example. ANDed with `filters` and with each other.
   * Defaults to `[]` — most segments still only ever need `filters`.
   */
  eventConditions?: readonly unknown[];
  createdByUserId: string;
  /** Defaults to `'user'` — set to `'api_key'` when the caller authenticated with a machine key (KAN-76's MCP `create_segment` tool) rather than a human, so the audit trail doesn't mislabel a key as a user. */
  createdByActorType?: 'user' | 'api_key';
}

/**
 * Creates a segment (KAN-76, E22.2; cross-schema event conditions added by
 * KAN-93): validates the name, that `schemaName` is a registered+active
 * `entity`-kind schema in this project, every filter condition's shape, and
 * every event condition's shape + that its own `schemaName` is a
 * registered+active `event`-kind schema — collecting every problem before
 * throwing, mirroring `createGoal`'s own "collect all reasons, don't fail
 * fast" convention.
 */
export async function createSegment(params: CreateSegmentParams): Promise<SegmentModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];

  const name = params.name.trim();
  if (name.length === 0) {
    reasons.push('A segment must have a non-empty name.');
  }

  const eventConditionInputs = params.eventConditions ?? [];
  if (params.filters.length === 0 && eventConditionInputs.length === 0) {
    reasons.push('A segment requires at least one filter condition or event condition.');
  }
  const validFilters: SegmentFilterCondition[] = [];
  params.filters.forEach((filter, index) => {
    if (isValidSegmentFilterCondition(filter)) {
      validFilters.push(filter);
    } else {
      reasons.push(`Filter at index ${index} is invalid — expected { field: string, op: one of ${['=', '!=', '>', '>=', '<', '<=', 'contains'].join(', ')}, value: string|number|boolean }.`);
    }
  });

  const validEventConditions: SegmentEventCondition[] = [];
  for (const [index, condition] of eventConditionInputs.entries()) {
    if (!isValidSegmentEventCondition(condition)) {
      reasons.push(`Event condition at index ${index} is invalid — expected { kind: "has_event"|"no_event", schemaName: string, filters?: [...], withinDays?: number }.`);
      continue;
    }
    const eventSchemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'event', condition.schemaName);
    if (!eventSchemaDef) {
      reasons.push(`Event schema "${condition.schemaName}" (event condition at index ${index}) is not registered (or not active) in this project.`);
      continue;
    }
    validEventConditions.push(condition);
  }

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
  segment.event_conditions = validEventConditions;
  segment.created_by = params.createdByUserId;
  segment.created_at = now;
  segment.owner_person_id = null;
  segment.status = 'open';
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
      after: { schemaName: segment.schema_name, filters: segment.filters, eventConditions: segment.event_conditions },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return segment;
}

export interface SuggestSegmentsParams {
  organizationId: string;
  projectId: string;
  schemaName: string;
}

export interface SuggestSegmentsResult {
  suggestions: readonly SegmentSuggestion[];
}

/**
 * A curated (not field-heuristic-derived) suggestion — the exact
 * "paying_no_demo" worked example plan `14 §Gap 9`'s own gap-analysis doc
 * and KAN-93's `SegmentEventCondition` doc comment both name verbatim, and
 * that `demos/page.tsx`'s own doc comment used to flag as "deliberately
 * not built" back when KAN-92 shipped (before KAN-93 added the cross-schema
 * `event_conditions` this suggestion relies on). `confidence: 1` since this
 * is a known-good, curated example, not a guessed field-name match — see
 * `suggestSegments`'s own doc comment for when it's actually proposed.
 */
const PAYING_NO_DEMO_SEGMENT_SUGGESTION: SegmentSuggestion = {
  name: 'Paying customers with no demo',
  filters: [{ field: 'status', op: '=', value: 'active' }],
  confidence: 1,
  eventConditions: [{ kind: 'no_event', schemaName: DEMO_EVENT_SCHEMA_NAME }],
};

/**
 * Proposes candidate segment definitions for one registered entity schema
 * (KAN-81, E14.x, plan `14 §Gap 9` "AI-suggested lists") by running
 * `@growthos/shared`'s deterministic `suggestSegmentCandidates` heuristic
 * against the schema's own declared fields — the same "buildable-today
 * stand-in for a real LLM call" posture `suggestFieldMappingRules` (KAN-55)
 * already established for the mapping-suggestion feature. Nothing is
 * persisted here; the caller still creates the segment through the existing
 * `createSegment` confirm step, exactly like KAN-55's mapping suggestions
 * merge into the existing rule editor rather than saving directly.
 *
 * When `schemaName` is Stripe's `stripe_subscription` entity (KAN-49) and
 * the project also has the Sales Pipeline pack's `demo_event` event schema
 * (KAN-92) registered+active, {@link PAYING_NO_DEMO_SEGMENT_SUGGESTION} is
 * prepended ahead of whatever the field heuristic itself proposes for
 * `stripe_subscription`'s own fields — a curated example takes priority
 * over a guessed one. Neither schema existing is itself new: this only
 * wires an already-registered pair of schemas into the suggestion list a
 * human reviews before creating the segment themselves.
 */
export async function suggestSegments(params: SuggestSegmentsParams): Promise<SuggestSegmentsResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const schemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'entity', params.schemaName);
  if (!schemaDef) {
    throw new InvalidSegmentError([`Entity schema "${params.schemaName}" is not registered (or not active) in this project.`]);
  }

  const fieldDefs = schemaDef.field_defs.map((field) => ({ name: field.name, type: field.type }));
  const suggestions = suggestSegmentCandidates(fieldDefs);

  if (params.schemaName === STRIPE_SUBSCRIPTION_ENTITY_NAME) {
    const demoEventSchemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'event', DEMO_EVENT_SCHEMA_NAME);
    if (demoEventSchemaDef) {
      suggestions.unshift(PAYING_NO_DEMO_SEGMENT_SUGGESTION);
    }
  }

  return { suggestions };
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

/** Confirms `ownerPersonId` resolves to an `OrgPersonModel` belonging to `organizationId` — the same `.init` + org-match pattern `goal.service.ts`'s own `validateOrgPersonInOrg` uses for `GoalModel.owner_person_id`. */
async function requireOrgPersonInOrg(organizationId: string, ownerPersonId: string): Promise<void> {
  const person = await OrgPersonModel.init(ownerPersonId, { organization_id: organizationId });
  if (!person || person.organization_id !== organizationId) {
    throw new InvalidSegmentError([`Owner "${ownerPersonId}" does not exist in this organization.`]);
  }
}

export interface AssignSegmentOwnerParams {
  organizationId: string;
  projectId: string;
  segmentId: string;
  /** `null` unassigns the segment's owner. */
  ownerPersonId: string | null;
  actorUserId: string;
}

/**
 * Assigns (or clears) a saved segment's work-list owner (KAN-81, E14.x) —
 * the "owner assignment" half of plan `14 §Gap 5`'s "live list" upgrade.
 * Audit-logged like every other in-place config change in this file.
 */
export async function assignSegmentOwner(params: AssignSegmentOwnerParams): Promise<SegmentModel> {
  const segment = await loadSegment(params.organizationId, params.projectId, params.segmentId);

  if (params.ownerPersonId !== null) {
    await requireOrgPersonInOrg(params.organizationId, params.ownerPersonId);
  }

  const previousOwnerPersonId = segment.owner_person_id;
  segment.owner_person_id = params.ownerPersonId;
  await segment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'segment.assign_owner',
      targetType: 'segment',
      targetId: segment.id,
      summary: `Assigned segment "${segment.name}" owner to ${params.ownerPersonId ?? '(unassigned)'}`,
      before: { ownerPersonId: previousOwnerPersonId },
      after: { ownerPersonId: params.ownerPersonId },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful update into a failure for the caller.
  }

  return segment;
}

export interface UpdateSegmentStatusParams {
  organizationId: string;
  projectId: string;
  segmentId: string;
  status: SegmentWorkListStatus;
  actorUserId: string;
}

/**
 * Ticks a saved segment's work-list status (KAN-81, E14.x) — the "status
 * ticking" half of plan `14 §Gap 5`'s "live list" upgrade. Audit-logged
 * like every other in-place config change in this file.
 */
export async function updateSegmentStatus(params: UpdateSegmentStatusParams): Promise<SegmentModel> {
  if (!isSegmentWorkListStatus(params.status)) {
    throw new InvalidSegmentError([`Unknown segment status "${params.status}".`]);
  }

  const segment = await loadSegment(params.organizationId, params.projectId, params.segmentId);
  const previousStatus = segment.status ?? 'open';
  segment.status = params.status;
  await segment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'segment.update_status',
      targetType: 'segment',
      targetId: segment.id,
      summary: `Updated segment "${segment.name}" status to "${params.status}"`,
      before: { status: previousStatus },
      after: { status: params.status },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful update into a failure for the caller.
  }

  return segment;
}

/** Same identifier-safety posture `packages/shared`'s metrics compiler applies to every compiled column reference (`assertSafeIdentifier`) — a segment's filter `field` is user-supplied and gets spliced directly into the JSON-subscript expression below, so only letters/digits/underscores are allowed through. */
const SAFE_SEGMENT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeSegmentFieldName(field: string): string {
  if (!SAFE_SEGMENT_FIELD_PATTERN.test(field)) {
    throw new InvalidSegmentError([`Unsafe filter field "${field}" — only letters, digits, and underscores are allowed, and it must start with a letter or underscore.`]);
  }
  return field;
}

/** The BigQuery JSON-extraction expression for one filter field, typed by the field's declared schema type (defaulting to a plain string extraction when the field isn't found on the active schema — e.g. a segment saved against a field an evolution later dropped). Mirrors `dbt/macros/cross_database.sql`'s `bigquery__json_text_field` convention (`LAX_STRING` over the JSON subscript operator) but adds the `LAX_FLOAT64`/`LAX_BOOL` typed variants a segment's `>`/`>=`/`<`/`<=` numeric filters and boolean-field equality checks need. `columnRef` defaults to the segment's own `entities.properties` column; `emitSegmentEventCondition` (KAN-93) passes `ev.properties` to extract from the correlated `events` subquery instead — always a fixed literal the calling code controls, never user input, so splicing it in directly carries no injection risk. */
function jsonFieldExtraction(fieldName: string, fieldType: SchemaFieldType | undefined, columnRef = 'properties'): string {
  const safeField = assertSafeSegmentFieldName(fieldName);
  if (fieldType === 'number') {
    return `LAX_FLOAT64(${columnRef}['${safeField}'])`;
  }
  if (fieldType === 'boolean') {
    return `LAX_BOOL(${columnRef}['${safeField}'])`;
  }
  return `LAX_STRING(${columnRef}['${safeField}'])`;
}

/** Compiles one saved filter condition into a `WHERE`-clause fragment plus its own bound parameter(s) — mirroring `mcp-tools.service.ts`'s hand-written-SQL-over-a-`WarehouseQueryExecutor` convention, since a segment's filters (unlike a metric's) run against the JSON `properties` column rather than a typed fact-table column. `contains` always compares as text (a `LIKE`, wildcard-escaped the same way `searchProjectCustomers` escapes its own search term); every other operator casts the bound parameter to the field's declared type first, since every parameter this executor abstraction accepts is a plain string (`CompilerParamValue`) and BigQuery infers a `STRING` parameter's type from the value it's given, not from how the SQL uses it. `columnRef` (see {@link jsonFieldExtraction}) lets `emitSegmentEventCondition` (KAN-93) reuse this exact compiler for an event condition's own nested filters. */
function emitSegmentFilterClause(
  condition: SegmentFilterCondition,
  paramName: string,
  fieldType: SchemaFieldType | undefined,
  params: Record<string, string>,
  columnRef = 'properties',
): string {
  if (!isSegmentFilterOperator(condition.op)) {
    throw new InvalidSegmentError([`Unknown filter operator "${condition.op}" on "${condition.field}".`]);
  }

  if (condition.op === 'contains') {
    params[paramName] = `%${escapeLikePattern(String(condition.value))}%`;
    return `LAX_STRING(${columnRef}['${assertSafeSegmentFieldName(condition.field)}']) LIKE @${paramName}`;
  }

  const extraction = jsonFieldExtraction(condition.field, fieldType, columnRef);
  params[paramName] = String(condition.value);
  const boundValue = fieldType === 'number' ? `SAFE_CAST(@${paramName} AS FLOAT64)` : fieldType === 'boolean' ? `SAFE_CAST(@${paramName} AS BOOL)` : `@${paramName}`;
  return `${extraction} ${condition.op} ${boundValue}`;
}

/**
 * Compiles one cross-schema {@link SegmentEventCondition} (KAN-93) into an
 * `[NOT ]EXISTS (...)` correlated-subquery fragment against the `events`
 * fact table, joined back to the outer `entities` row by id — `events.entity_id`
 * is the record's own `client_id` (see `events.sql`), the same identity an
 * `entities` row is keyed by (see `entities.sql`), so no denormalized field
 * or extra join table is needed. Scoped to the same org/project(/environment)
 * the entity-side filters already are, so a segment never leaks another
 * project's events into its own member count.
 */
function emitSegmentEventCondition(
  condition: SegmentEventCondition,
  index: number,
  environmentId: string | undefined,
  fieldTypeByName: ReadonlyMap<string, SchemaFieldType>,
  params: Record<string, string>,
): string {
  const schemaParam = `event_schema_${index}`;
  params[schemaParam] = condition.schemaName;

  // `events` (KAN-37's core dbt model) names this column `event_type`, not
  // `schema_name` — unlike `entities`, which does use `schema_name` (see
  // `mcp-tools.service.ts`'s own `event_type IN (...)` filter for the same
  // distinction on its event-side query).
  const innerFilters = ['ev.organization_id = @organizationId', 'ev.project_id = @projectId', `ev.event_type = @${schemaParam}`, 'ev.entity_id = entities.entity_id'];
  if (environmentId !== undefined) {
    innerFilters.push('ev.environment_id = @environmentId');
  }
  if (condition.withinDays !== undefined) {
    const sinceParam = `event_since_${index}`;
    params[sinceParam] = new Date(Date.now() - condition.withinDays * 24 * 60 * 60 * 1000).toISOString();
    innerFilters.push(`ev.occurred_at >= TIMESTAMP(@${sinceParam})`);
  }
  (condition.filters ?? []).forEach((filter, filterIndex) => {
    innerFilters.push(emitSegmentFilterClause(filter, `event_${index}_filter_${filterIndex}`, fieldTypeByName.get(filter.field), params, 'ev.properties'));
  });

  const existsClause = `EXISTS (SELECT 1 FROM events AS ev WHERE ${innerFilters.join(' AND ')})`;
  return condition.kind === 'no_event' ? `NOT ${existsClause}` : existsClause;
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
/** The `WHERE`-clause fragments + bound parameters common to every warehouse read scoped to one segment's own schema+filters (`countSegmentMembers` and `listSegmentMembers` alike) — factored out once a second caller needed the exact same compilation `countSegmentMembers` already did. */
async function buildSegmentMemberWhereClause(
  organizationId: string,
  projectId: string,
  segment: SegmentModel,
  environmentId: string | undefined,
): Promise<{ filters: string[]; queryParams: Record<string, string> }> {
  const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'entity', segment.schema_name);
  const fieldTypeByName = new Map((schemaDef?.field_defs ?? []).map((field) => [field.name, field.type]));

  const filters = ['organization_id = @organizationId', 'project_id = @projectId', 'schema_name = @schemaName'];
  const queryParams: Record<string, string> = {
    organizationId,
    projectId,
    schemaName: segment.schema_name,
  };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }
  segment.filters.forEach((condition, index) => {
    filters.push(emitSegmentFilterClause(condition, `filter_${index}`, fieldTypeByName.get(condition.field), queryParams));
  });

  for (const [index, condition] of (segment.event_conditions ?? []).entries()) {
    const eventSchemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', condition.schemaName);
    const eventFieldTypeByName = new Map((eventSchemaDef?.field_defs ?? []).map((field) => [field.name, field.type]));
    filters.push(emitSegmentEventCondition(condition, index, environmentId, eventFieldTypeByName, queryParams));
  }

  return { filters, queryParams };
}

export async function countSegmentMembers(params: CountSegmentMembersParams): Promise<SegmentMemberCountOutcome> {
  const segment = await loadSegment(params.organizationId, params.projectId, params.segmentId);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;
  const { filters, queryParams } = await buildSegmentMemberWhereClause(params.organizationId, params.projectId, segment, environmentId);

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

/** One matching entity row `listSegmentMembers` hands back — the same shape `CustomerSearchResult` (`mcp-tools.service.ts`) already establishes for a warehouse-backed entity projection, so a caller (e.g. `syncSegmentToCrm`) gets a stable, JSON-serializable record without needing to know this ran hand-written SQL. */
export interface SegmentMemberRow {
  entityId: string;
  properties: unknown;
  lastSeenAt: string;
}

/** Bounds how many of a segment's matching rows one `listSegmentMembers` call ever fetches — the same "buildable-today, bounded" posture every other Firestore/warehouse "list this project's X" read in this codebase already carries (see `searchProjectCustomers`'s own `MAX_CUSTOMER_SEARCH_LIMIT`), until a real paginated export exists. */
export const MAX_SEGMENT_MEMBER_LIST_LIMIT = 1000;
const DEFAULT_SEGMENT_MEMBER_LIST_LIMIT = 500;

export interface ListSegmentMembersParams {
  organizationId: string;
  projectId: string;
  segmentId: string;
  /** Same semantics as `CountSegmentMembersParams.environmentId`. */
  environmentId?: string;
  /** Defaults to {@link DEFAULT_SEGMENT_MEMBER_LIST_LIMIT}, clamped to {@link MAX_SEGMENT_MEMBER_LIST_LIMIT}. */
  limit?: number;
  executor?: WarehouseQueryExecutor;
}

/** Mirrors `SegmentMemberCountOutcome`'s exact ok/degraded-reason split — a caller that lists members to push somewhere (e.g. `syncSegmentToCrm`) hits the same expected-not-buggy failure modes a member-count badge does, so it degrades the same honest way rather than throwing a generic error. */
export type SegmentMemberListOutcome =
  | { ok: true; members: SegmentMemberRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

/**
 * Lists the actual `entities` rows (not just a count) currently matching a
 * saved segment's own schema + ANDed filter conditions (KAN-81, plan `14
 * §Gap 5`: "export/sync to CRM") — `countSegmentMembers`'s row-returning
 * sibling, sharing its exact filter-compilation via
 * `buildSegmentMemberWhereClause`. Bounded to `limit` (never unbounded — see
 * `MAX_SEGMENT_MEMBER_LIST_LIMIT`'s own doc comment), newest-`last_seen_at`
 * first so a bounded call favors the freshest rows over an arbitrary
 * warehouse-native order.
 */
export async function listSegmentMembers(params: ListSegmentMembersParams): Promise<SegmentMemberListOutcome> {
  const segment = await loadSegment(params.organizationId, params.projectId, params.segmentId);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;
  const { filters, queryParams } = await buildSegmentMemberWhereClause(params.organizationId, params.projectId, segment, environmentId);
  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_SEGMENT_MEMBER_LIST_LIMIT, MAX_SEGMENT_MEMBER_LIST_LIMIT));

  const sql = `SELECT entity_id, properties, last_seen_at FROM entities WHERE ${filters.join(' AND ')} ORDER BY last_seen_at DESC LIMIT ${limit}`;
  try {
    const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'list_segment_members' }, () =>
      executor.execute({ sql, params: queryParams }),
    );
    return {
      ok: true,
      members: rows.map((row) => ({
        entityId: String(row.entity_id ?? ''),
        properties: parseJsonColumn(row.properties),
        lastSeenAt: String(row.last_seen_at ?? ''),
      })),
    };
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

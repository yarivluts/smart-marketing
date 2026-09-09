import { collectIdentifiers, MetricCompilerError, parseFormula } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import {
  isMetricAggFunction,
  isMetricDefinitionKind,
  isMetricFilterOperator,
  MetricDefModel,
  type MetricAggFunction,
  type MetricAggregationDef,
  type MetricDefinitionKind,
  type MetricFilterDef,
} from '../models/metric-def.model';
import type { SchemaFieldType } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { getActiveMartSchemaByName } from './schema-registry.service';
import { martIntrinsicColumnTypes } from '../warehouse/schema-mart';
import { BIGQUERY_DISABLED_CORE_TABLES, CORE_TABLE_CATALOG, getCoreTableColumns, isNumericCoreColumnType } from '../warehouse/core-table-catalog';
import { recordAuditLogEntry } from './audit-log.service';

export class InvalidMetricDefinitionError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid metric definition: ${reasons.join('; ')}`);
    this.name = 'InvalidMetricDefinitionError';
  }
}

export class DuplicateMetricDefinitionError extends Error {
  constructor() {
    super('A metric with this name is already registered in this project. Evolve it instead of registering it again.');
    this.name = 'DuplicateMetricDefinitionError';
  }
}

export class MetricDefNotFoundError extends Error {
  constructor() {
    super('No metric is registered under this name in this project yet. Register it first.');
    this.name = 'MetricDefNotFoundError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** A metric name (and every name a formula references) must be a valid identifier — the same vocabulary plan `04 §2`'s examples use (`cac`, `cost_per_signup`). */
const METRIC_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Every metric-shaped identifier a formula references, e.g. `ad_spend /
 * signups` -> `['ad_spend', 'signups']`. Reuses the same
 * `packages/shared/src/metrics-compiler` parser `compileMetricQueryForProject`
 * (`metrics-compiler.service.ts`) already resolves formulas with, rather than
 * a second hand-rolled character-class/regex validator — besides the reuse
 * win, a second implementation would need its own carve-out for `max`/`min`
 * function-call syntax (`FORMULA_FUNCTION_NAMES`) so `max(...)`/`min(...)`
 * aren't themselves mistaken for referenced metric names needing to exist in
 * the catalog. `parseFormula` throws `MetricCompilerError` on anything
 * structurally invalid (bad characters, unbalanced parens, an unknown
 * function name, trailing content, ...) — left to propagate;
 * `validateDefinitionBody` catches it and folds the message into the batched
 * `reasons` list exactly like the old regex checks did, rather than this
 * function short-circuiting validation with its own separate error type.
 */
function extractFormulaReferences(formula: string): string[] {
  return [...new Set(collectIdentifiers(parseFormula(formula)))];
}

/** Caller-facing shape for one base filter before it's validated into a `MetricFilterDef`. */
export interface MetricFilterInput {
  field: string;
  operator: string;
  value: string;
}

/** Caller-facing shape for an aggregation-kind definition before it's validated into a `MetricAggregationDef`. */
export interface MetricAggregationInput {
  function: string;
  table: string;
  column?: string;
  timeColumn: string;
  filters: readonly MetricFilterInput[];
}

/** Caller-facing shape for a metric's definition body — exactly one of `aggregation`/`formula` is expected, matching `kind`. */
export type MetricDefinitionInput =
  | { kind: 'aggregation'; aggregation: MetricAggregationInput; formula?: undefined }
  | { kind: 'formula'; formula: string; aggregation?: undefined };

function validateFilters(filters: readonly MetricFilterInput[], reasons: string[]): MetricFilterDef[] {
  const validated: MetricFilterDef[] = [];
  for (const filter of filters) {
    const field = filter.field.trim();
    if (field.length === 0) {
      reasons.push('Every filter must declare a non-empty field.');
      continue;
    }
    if (!isMetricFilterOperator(filter.operator)) {
      reasons.push(`Filter on "${field}" has an unknown operator "${filter.operator}".`);
      continue;
    }
    if (filter.value.trim().length === 0) {
      reasons.push(`Filter on "${field}" must have a non-empty value.`);
      continue;
    }
    validated.push({ field, operator: filter.operator, value: filter.value.trim() });
  }
  return validated;
}

/** Validates an aggregation into a `MetricAggregationDef`, or `undefined` if any reason was pushed — callers must not use the return value without also checking `reasons`. */
function validateAggregation(input: MetricAggregationInput, reasons: string[]): MetricAggregationDef | undefined {
  const reasonsBefore = reasons.length;

  if (!isMetricAggFunction(input.function)) {
    reasons.push(`Unknown aggregation function "${input.function}".`);
    return undefined;
  }
  const table = input.table.trim();
  if (table.length === 0) {
    reasons.push('An aggregation must declare a non-empty source table.');
  }
  const column = input.column?.trim();
  if (input.function !== 'count' && (!column || column.length === 0)) {
    reasons.push(`Aggregation function "${input.function}" requires a column.`);
  }
  const timeColumn = input.timeColumn.trim();
  if (timeColumn.length === 0) {
    reasons.push('An aggregation must declare a non-empty time column to bucket by.');
  }
  const filters = validateFilters(input.filters, reasons);

  if (reasons.length > reasonsBefore) {
    return undefined;
  }
  return { function: input.function, table, ...(column ? { column } : {}), timeColumn, filters };
}

/**
 * Aggregation functions whose column must be numeric. `count` needs no
 * column at all; `count_distinct`/`min`/`max` are legitimate over a string
 * or timestamp column (distinct ids, earliest/latest value), so only
 * `sum`/`avg` genuinely require a number.
 */
const NUMERIC_COLUMN_AGG_FUNCTIONS = new Set<MetricAggFunction>(['sum', 'avg']);

/**
 * When an aggregation's `table` names one of the project's own registered
 * measure/entity schemas, the real warehouse relation is that schema's
 * auto-generated mart view (`warehouse/schema-mart.ts`) — whose columns are
 * exactly the schema's declared fields plus that kind's intrinsic columns.
 * So we can (and should) catch here, at registration time,
 * an aggregation that names a column the mart won't have or sums a
 * non-numeric one: without this the metric registers fine and only fails
 * silently at query time, rendering an empty tile. This is precisely the
 * failure mode a one-field `entity` schema (no numeric field) hit when a
 * `sum` metric was registered against it.
 *
 * A `table` matching no active measure/entity schema — a dbt-built core
 * table like `fact_ad_spend`, whose column catalog the registry doesn't
 * know — is left entirely alone, mirroring `mapCustomSchemaTables`'s own
 * scope in `metrics-compiler.service.ts`.
 */
async function validateAggregationAgainstRegisteredSchema(
  organizationId: string,
  projectId: string,
  aggregation: MetricAggregationDef,
  dimensions: readonly string[],
  reasons: string[],
  options: { unknownTableIsError: boolean } = { unknownTableIsError: false },
): Promise<void> {
  // One indexed lookup for the active measure/entity schema this table would
  // resolve to (mapCustomSchemaTables' own scope) — never a full scan of the
  // project's schema defs, which would add an unbounded read to every metric
  // registration.
  const schema = await getActiveMartSchemaByName(organizationId, projectId, aggregation.table);
  if (!schema) {
    validateAggregationAgainstCoreTable(aggregation, dimensions, reasons, options);
    return;
  }

  // Mirrors the SELECT list `buildMartViewSql` emits: every declared field, plus the intrinsic columns that kind's mart carries (read from the builder itself so the two can't drift).
  const columnTypes = new Map<string, SchemaFieldType>([...martIntrinsicColumnTypes(schema.kind), ...schema.field_defs.map((field): [string, SchemaFieldType] => [field.name, field.type])]);
  validateAggregationColumns({
    aggregation,
    dimensions,
    reasons,
    relationLabel: `schema "${schema.name}" (${schema.kind})`,
    hasColumn: (column) => columnTypes.has(column),
    isNumericColumn: (column) => columnTypes.get(column) === 'number',
    describeColumnType: (column) => columnTypes.get(column) ?? 'unknown',
    availableColumns: [...columnTypes.keys()].sort().join(', '),
  });
}

/**
 * The core-table half of registration validation (EasySign audit P-05): an
 * aggregation that names no registered schema is checked against the dbt
 * core table catalog — every column it touches (time column, aggregated
 * column, base-filter fields, declared dimensions) must exist on the table.
 * Reads the static `CORE_TABLE_CATALOG` — see its own doc comment for why
 * registration stays a pure Firestore + CPU check rather than a live
 * warehouse introspection.
 *
 * A table that is neither a registered schema nor a catalogued core table
 * is only an error when `unknownTableIsError` is set: `auditMetricCatalogHealth`
 * sets it (an active metric pointing at a relation this codebase can't
 * vouch for IS a health problem worth surfacing), registration doesn't —
 * a project may legitimately register against a relation provisioned
 * outside this codebase's knowledge, and refusing it outright would turn a
 * catalog gap into a hard block. A dbt model known to be disabled on the
 * warehouse is always an error: no future provisioning can make it work.
 */
function validateAggregationAgainstCoreTable(
  aggregation: MetricAggregationDef,
  dimensions: readonly string[],
  reasons: string[],
  options: { unknownTableIsError: boolean },
): void {
  if (BIGQUERY_DISABLED_CORE_TABLES.has(aggregation.table)) {
    reasons.push(`Table "${aggregation.table}" is a dbt core model that is not built in the warehouse yet, so no metric can be queried against it.`);
    return;
  }
  const columns = getCoreTableColumns(aggregation.table);
  if (!columns) {
    if (options.unknownTableIsError) {
      reasons.push(
        `Table "${aggregation.table}" is neither one of this project's registered measure/entity schemas nor a dbt core table. Core tables: ${Object.keys(CORE_TABLE_CATALOG).sort().join(', ')}.`,
      );
    }
    return;
  }
  validateAggregationColumns({
    aggregation,
    dimensions,
    reasons,
    relationLabel: `core table "${aggregation.table}"`,
    hasColumn: (column) => columns[column] !== undefined,
    isNumericColumn: (column) => {
      const type = columns[column];
      return type !== undefined && isNumericCoreColumnType(type);
    },
    describeColumnType: (column) => columns[column] ?? 'unknown',
    availableColumns: Object.keys(columns).sort().join(', '),
  });
}

interface ValidateAggregationColumnsParams {
  aggregation: MetricAggregationDef;
  dimensions: readonly string[];
  reasons: string[];
  relationLabel: string;
  hasColumn: (column: string) => boolean;
  isNumericColumn: (column: string) => boolean;
  describeColumnType: (column: string) => string;
  availableColumns: string;
}

/** The column checks shared by the registered-schema and core-table branches — one list of rules, so the two relations can't drift in what they enforce. */
function validateAggregationColumns(params: ValidateAggregationColumnsParams): void {
  const { aggregation, dimensions, reasons, relationLabel, availableColumns } = params;

  if (!params.hasColumn(aggregation.timeColumn)) {
    reasons.push(`Aggregation time column "${aggregation.timeColumn}" does not exist on ${relationLabel}. Available columns: ${availableColumns}.`);
  }

  if (aggregation.column !== undefined) {
    if (!params.hasColumn(aggregation.column)) {
      reasons.push(`Aggregation column "${aggregation.column}" does not exist on ${relationLabel}. Available columns: ${availableColumns}.`);
    } else if (NUMERIC_COLUMN_AGG_FUNCTIONS.has(aggregation.function) && !params.isNumericColumn(aggregation.column)) {
      reasons.push(
        `Aggregation function "${aggregation.function}" over ${relationLabel} needs a numeric column, but "${aggregation.column}" is of type ${params.describeColumnType(aggregation.column)}.`,
      );
    }
  }

  for (const filter of aggregation.filters) {
    if (!params.hasColumn(filter.field)) {
      reasons.push(`Filter field "${filter.field}" does not exist on ${relationLabel}. Available columns: ${availableColumns}.`);
    }
  }

  // The compiler emits every declared dimension as a literal GROUP BY column
  // on the aggregation's own table (`compiler.ts`'s own "no join graph"
  // limitation), so a dimension the table doesn't carry can never be broken
  // down by — it only fails at query time as "Unrecognized name".
  for (const dimension of dimensions) {
    if (!params.hasColumn(dimension)) {
      reasons.push(`Dimension "${dimension}" does not exist on ${relationLabel}. Available columns: ${availableColumns}.`);
    }
  }
}

/**
 * Formula operands must all be able to break down by every dimension the
 * formula declares (EasySign audit P-06): the compiler groups each leaf
 * aggregation by the same dimension list, so `cac = ad_spend / new_paying`
 * declared with `platform` compiles into a `GROUP BY platform` against a
 * table that has no such column. A formula therefore may declare only
 * dimensions in the INTERSECTION of its operands' own dimension sets — the
 * reason a CAC decomposed by channel needs both spend and conversions keyed
 * by that channel, not a validation gap to paper over.
 */
function validateFormulaDimensions(dimensions: readonly string[], referencedActive: readonly MetricDefModel[], reasons: string[]): void {
  for (const dimension of dimensions) {
    const lacking = referencedActive.filter((reference) => !reference.dimensions.includes(dimension)).map((reference) => reference.name);
    if (lacking.length > 0) {
      reasons.push(`Formula dimension "${dimension}" is not declared on referenced metric(s): ${lacking.join(', ')}. A formula may only declare dimensions every operand shares.`);
    }
  }
}

interface ValidatedDefinition {
  definitionKind: MetricDefinitionKind;
  aggregation?: MetricAggregationDef;
  formula?: string;
  formulaReferences: string[];
}

function validateDefinitionBody(definition: MetricDefinitionInput, reasons: string[]): ValidatedDefinition | undefined {
  if (!isMetricDefinitionKind(definition.kind)) {
    reasons.push(`Unknown metric definition kind "${(definition as { kind: string }).kind}".`);
    return undefined;
  }

  if (definition.kind === 'aggregation') {
    const aggregation = validateAggregation(definition.aggregation, reasons);
    if (!aggregation) {
      return undefined;
    }
    return { definitionKind: 'aggregation', aggregation, formulaReferences: [] };
  }

  const formula = definition.formula.trim();
  if (formula.length === 0) {
    reasons.push('A formula must be a non-empty expression.');
    return undefined;
  }
  let formulaReferences: string[];
  try {
    formulaReferences = extractFormulaReferences(formula);
  } catch (error) {
    reasons.push(error instanceof MetricCompilerError ? error.message : 'A formula is not a valid expression.');
    return undefined;
  }
  if (formulaReferences.length === 0) {
    reasons.push('A formula must reference at least one other metric.');
    return undefined;
  }
  return { definitionKind: 'formula', formula, formulaReferences };
}

function validateDimensions(dimensions: readonly string[], reasons: string[]): string[] {
  const seen = new Set<string>();
  const validated: string[] = [];
  for (const dimension of dimensions) {
    const trimmed = dimension.trim();
    if (trimmed.length === 0) {
      reasons.push('A dimension name cannot be empty.');
      continue;
    }
    if (seen.has(trimmed)) {
      reasons.push(`Dimension "${trimmed}" is declared more than once.`);
      continue;
    }
    seen.add(trimmed);
    validated.push(trimmed);
  }
  return validated;
}

interface MetricDefRequest {
  organizationId: string;
  projectId: string;
  name: string;
  definition: MetricDefinitionInput;
  dimensions: readonly string[];
}

interface ValidatedMetricDefRequest {
  name: string;
  definition: ValidatedDefinition;
  dimensions: string[];
}

/** Shared name/definition/dimensions validation for register and evolve. */
async function validateMetricDefRequest(request: MetricDefRequest): Promise<ValidatedMetricDefRequest> {
  await requireProjectInOrg(request.organizationId, request.projectId);

  const reasons: string[] = [];
  const name = request.name.trim();
  if (name.length === 0) {
    reasons.push('A metric must have a non-empty name.');
  } else if (!METRIC_NAME_PATTERN.test(name)) {
    reasons.push('A metric name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.');
  }

  const definition = validateDefinitionBody(request.definition, reasons);
  const dimensions = validateDimensions(request.dimensions, reasons);

  // Only once the aggregation itself is structurally valid — otherwise
  // there's no well-formed table/column/function to check against a schema.
  if (definition?.definitionKind === 'aggregation' && definition.aggregation) {
    await validateAggregationAgainstRegisteredSchema(request.organizationId, request.projectId, definition.aggregation, dimensions, reasons);
  }

  if (reasons.length > 0 || !definition) {
    throw new InvalidMetricDefinitionError(reasons);
  }

  if (definition.definitionKind === 'formula') {
    if (definition.formulaReferences.includes(name)) {
      throw new InvalidMetricDefinitionError([`A metric formula cannot reference itself ("${name}").`]);
    }

    const resolved = await Promise.all(
      definition.formulaReferences.map(async (referenceName) => ({
        referenceName,
        active: await findActiveVersion(request.organizationId, request.projectId, referenceName),
      })),
    );
    const missing = resolved.filter((entry) => !entry.active).map((entry) => entry.referenceName);
    if (missing.length > 0) {
      throw new InvalidMetricDefinitionError(missing.map((referenceName) => `Formula references unknown metric "${referenceName}".`));
    }

    const referencedActive = resolved.map((entry) => entry.active as MetricDefModel);
    validateFormulaDimensions(dimensions, referencedActive, reasons);
    if (reasons.length > 0) {
      throw new InvalidMetricDefinitionError(reasons);
    }
    if (await formulaCreatesCycle(request.organizationId, request.projectId, name, referencedActive)) {
      throw new InvalidMetricDefinitionError([`Formula for "${name}" creates a circular dependency between metrics.`]);
    }
  }

  return { name, definition, dimensions };
}

/** One registered-and-active metric that can no longer be queried as defined, with the registration-time reasons that now fail for it — the payload behind `list_insights`'s `metric_health` kind. */
export interface MetricHealthProblem {
  metricDefId: string;
  name: string;
  version: number;
  reasons: string[];
}

/**
 * Re-runs registration validation over every `active` metric in a project
 * (EasySign audit P-03: 32 of 40 metrics failed at query time while
 * `list_insights` reported nothing). Catches what registration would reject
 * today — a table the warehouse doesn't build, a column/dimension/filter
 * field the table lacks, a formula operand that is no longer active or that
 * lacks the formula's dimensions — for metrics registered before those
 * checks existed. Pure Firestore + CPU: no warehouse round trip, no query
 * quota consumed, so it's cheap enough to run on every `list_insights`.
 */
export async function auditMetricCatalogHealth(organizationId: string, projectId: string): Promise<MetricHealthProblem[]> {
  const defs = await listMetricDefinitionsForProject(organizationId, projectId);
  const activeByName = new Map(defs.filter((def) => def.status === 'active').map((def) => [def.name, def] as const));
  const problems: MetricHealthProblem[] = [];

  for (const def of activeByName.values()) {
    const reasons: string[] = [];
    if (def.definition_kind === 'aggregation' && def.aggregation) {
      await validateAggregationAgainstRegisteredSchema(organizationId, projectId, def.aggregation, def.dimensions, reasons, { unknownTableIsError: true });
    } else if (def.definition_kind === 'formula' && def.formula) {
      let references: string[] = [];
      try {
        references = extractFormulaReferences(def.formula);
      } catch (error) {
        reasons.push(error instanceof MetricCompilerError ? error.message : 'The formula is not a valid expression.');
      }
      const referencedActive: MetricDefModel[] = [];
      for (const referenceName of references) {
        const reference = activeByName.get(referenceName);
        if (!reference) {
          reasons.push(`Formula references metric "${referenceName}", which has no active version in this project.`);
        } else {
          referencedActive.push(reference);
        }
      }
      validateFormulaDimensions(def.dimensions, referencedActive, reasons);
    }
    if (reasons.length > 0) {
      problems.push({ metricDefId: def.id, name: def.name, version: def.version, reasons });
    }
  }

  return problems.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detects whether defining `name`'s formula to depend on `referencedActive`
 * would create a cycle: BFS over each reference's own active formula
 * dependencies (transitively) looking for `name`. Needed because a
 * dependency graph that was acyclic when metric A first referenced metric B
 * can still become cyclic later if B is subsequently evolved to reference A
 * — at evolution time B's own validation only checks that A currently
 * exists and is active, not what depends on B.
 */
async function formulaCreatesCycle(
  organizationId: string,
  projectId: string,
  name: string,
  referencedActive: readonly MetricDefModel[],
): Promise<boolean> {
  const visited = new Set<string>();
  let frontier = referencedActive;

  while (frontier.length > 0) {
    const nextNames = new Set<string>();
    for (const metricDef of frontier) {
      if (metricDef.name === name) {
        return true;
      }
      if (visited.has(metricDef.name)) {
        continue;
      }
      visited.add(metricDef.name);
      if (metricDef.definition_kind === 'formula' && metricDef.formula) {
        for (const referenceName of extractFormulaReferences(metricDef.formula)) {
          if (!visited.has(referenceName)) {
            nextNames.add(referenceName);
          }
        }
      }
    }

    if (nextNames.size === 0) {
      return false;
    }
    const nextFrontier = await Promise.all(
      [...nextNames].map((referenceName) => findActiveVersion(organizationId, projectId, referenceName)),
    );
    frontier = nextFrontier.filter((metricDef): metricDef is MetricDefModel => Boolean(metricDef));
  }

  return false;
}

/** Cheap existence check for `registerMetricDefinition` — a `.limit(1)` query instead of fetching every version just to check `.length > 0`. */
async function metricFamilyHasAnyVersion(organizationId: string, projectId: string, name: string): Promise<boolean> {
  const matches = await MetricDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('name', '==', name)
    .limit(1)
    .get();
  return matches.length > 0;
}

/** The one `active` version of a metric family, queried directly instead of fetching the full version history just to find it. */
async function findActiveVersion(organizationId: string, projectId: string, name: string): Promise<MetricDefModel | undefined> {
  const matches = await MetricDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('name', '==', name)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return matches[0];
}

interface BuildMetricDefVersionParams {
  organizationId: string;
  projectId: string;
  name: string;
  version: number;
  definition: ValidatedDefinition;
  dimensions: string[];
  createdByUserId: string;
}

/** Constructs one `active` version document — shared by register (v1) and evolve (v{n+1}) so a future field addition can't land on only one of the two paths. */
function buildMetricDefVersion(params: BuildMetricDefVersionParams): MetricDefModel {
  const metricDef = new MetricDefModel();
  metricDef.organization_id = params.organizationId;
  metricDef.project_id = params.projectId;
  metricDef.name = params.name;
  metricDef.version = params.version;
  metricDef.status = 'active';
  metricDef.definition_kind = params.definition.definitionKind;
  if (params.definition.aggregation) {
    metricDef.aggregation = params.definition.aggregation;
  }
  if (params.definition.formula) {
    metricDef.formula = params.definition.formula;
  }
  metricDef.dimensions = params.dimensions;
  metricDef.created_by = params.createdByUserId;
  metricDef.created_at = new Date().toISOString();
  metricDef.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  return metricDef;
}

/**
 * A metric-def snapshot for an audit-log `before`/`after` payload, omitting
 * `aggregation`/`formula` when unset rather than passing them through as
 * `undefined` — Firestore's `setDoc` rejects any field whose value is
 * `undefined`, which would otherwise make every `recordAuditLogEntry` call
 * here throw and get silently swallowed by its own best-effort try/catch.
 */
function auditSnapshot(metricDef: MetricDefModel): Record<string, unknown> {
  return {
    definitionKind: metricDef.definition_kind,
    dimensions: metricDef.dimensions,
    version: metricDef.version,
    ...(metricDef.aggregation ? { aggregation: metricDef.aggregation } : {}),
    ...(metricDef.formula ? { formula: metricDef.formula } : {}),
  };
}

export interface RegisterMetricDefinitionParams {
  organizationId: string;
  projectId: string;
  name: string;
  definition: MetricDefinitionInput;
  dimensions: readonly string[];
  createdByUserId: string;
}

/**
 * Registers the first version (v1) of a new metric in a project (plan
 * `04 §2`). Not transactional: two concurrent registrations for the same
 * name can both pass the existence check before either writes, producing
 * two "v1 active" documents for one family — the same known,
 * deliberately-deferred gap `registerSchemaDefinition` (KAN-31) documents,
 * for the same reason (a fix needs a Firestore transaction, reserved to
 * `firestore-connection.ts`).
 */
export async function registerMetricDefinition(params: RegisterMetricDefinitionParams): Promise<MetricDefModel> {
  const { name, definition, dimensions } = await validateMetricDefRequest(params);

  const alreadyExists = await metricFamilyHasAnyVersion(params.organizationId, params.projectId, name);
  if (alreadyExists) {
    throw new DuplicateMetricDefinitionError();
  }

  const metricDef = buildMetricDefVersion({
    organizationId: params.organizationId,
    projectId: params.projectId,
    name,
    version: 1,
    definition,
    dimensions,
    createdByUserId: params.createdByUserId,
  });
  await metricDef.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'metric_def.register',
      targetType: 'metric_def',
      targetId: metricDef.id,
      summary: `Registered metric "${metricDef.name}" v${metricDef.version}`,
      after: auditSnapshot(metricDef),
    });
  } catch {
    // Best-effort — audit logging must never turn a successful registration into a failure for the caller.
  }

  return metricDef;
}

export interface EvolveMetricDefinitionParams {
  organizationId: string;
  projectId: string;
  name: string;
  definition: MetricDefinitionInput;
  dimensions: readonly string[];
  createdByUserId: string;
}

/**
 * Registers the next version of an already-registered metric. The previous
 * version's document is kept as-is — only its `status` flips to
 * `superseded` — so historical dashboards can still pin it (plan `04 §7`).
 * Not transactional, for the same reason documented on
 * `registerMetricDefinition`.
 */
export async function evolveMetricDefinition(params: EvolveMetricDefinitionParams): Promise<MetricDefModel> {
  const { name, definition, dimensions } = await validateMetricDefRequest(params);

  const previous = await findActiveVersion(params.organizationId, params.projectId, name);
  if (!previous) {
    throw new MetricDefNotFoundError();
  }

  previous.status = 'superseded';
  const next = buildMetricDefVersion({
    organizationId: params.organizationId,
    projectId: params.projectId,
    name,
    version: previous.version + 1,
    definition,
    dimensions,
    createdByUserId: params.createdByUserId,
  });

  await Promise.all([previous.save(), next.save()]);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'metric_def.evolve',
      targetType: 'metric_def',
      targetId: next.id,
      summary: `Evolved metric "${next.name}" to v${next.version}`,
      before: auditSnapshot(previous),
      after: auditSnapshot(next),
    });
  } catch {
    // Best-effort — see the comment in registerMetricDefinition above.
  }

  return next;
}

/** Every version of every metric family in a project — the admin browse view. */
export async function listMetricDefinitionsForProject(organizationId: string, projectId: string): Promise<MetricDefModel[]> {
  const defs = await MetricDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return defs.sort((a, b) => a.name.localeCompare(b.name) || a.version - b.version);
}

/** The full version history of one metric family, oldest first. */
export async function listMetricDefinitionVersions(organizationId: string, projectId: string, name: string): Promise<MetricDefModel[]> {
  const versions = await MetricDefModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('name', '==', name)
    .get();
  return versions.sort((a, b) => a.version - b.version);
}

/** The current `active` version of one metric family, or `null` if it's never been registered — the shape a future compiler (KAN-41) would consume. */
export async function getActiveMetricDefinition(organizationId: string, projectId: string, name: string): Promise<MetricDefModel | null> {
  const active = await findActiveVersion(organizationId, projectId, name);
  return active ?? null;
}

/** `archiveMetricDefinition` refused because another active formula still references this family — archiving it would silently break that formula at query time instead of at registration, the exact failure class the registry now guards against. */
export class MetricDefStillReferencedError extends Error {
  constructor(public readonly referencedBy: readonly string[]) {
    super(`This metric is still referenced by active formula metric(s): ${referencedBy.join(', ')}. Archive or evolve those first.`);
    this.name = 'MetricDefStillReferencedError';
  }
}

export interface ArchiveMetricDefinitionParams {
  organizationId: string;
  projectId: string;
  name: string;
  archivedByUserId: string;
}

/**
 * Retires a metric family (EasySign audit J-02: dead, duplicate, and
 * test-artefact definitions had no way out of a customer's catalog — the
 * registry could only ever evolve a family, never end it). Flips the one
 * `active` version to `archived` (see `METRIC_DEF_STATUSES`); nothing is
 * deleted, so the audit trail and any historical dashboard pin survive.
 * Refuses while an active formula still references the family, because
 * every formula reference is resolved through `findActiveVersion` — the
 * same dependency check registration applies in the forward direction.
 */
export async function archiveMetricDefinition(params: ArchiveMetricDefinitionParams): Promise<MetricDefModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const name = params.name.trim();
  const active = await findActiveVersion(params.organizationId, params.projectId, name);
  if (!active) {
    throw new MetricDefNotFoundError();
  }

  const defs = await listMetricDefinitionsForProject(params.organizationId, params.projectId);
  const referencedBy = defs
    .filter((def) => def.status === 'active' && def.definition_kind === 'formula' && def.formula !== undefined && def.name !== name)
    .filter((def) => {
      try {
        return extractFormulaReferences(def.formula as string).includes(name);
      } catch {
        return false;
      }
    })
    .map((def) => def.name);
  if (referencedBy.length > 0) {
    throw new MetricDefStillReferencedError(referencedBy);
  }

  active.status = 'archived';
  await active.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.archivedByUserId,
      action: 'metric_def.archive',
      targetType: 'metric_def',
      targetId: active.id,
      summary: `Archived metric "${active.name}" v${active.version}`,
      before: { ...auditSnapshot(active), status: 'active' },
      after: { ...auditSnapshot(active), status: 'archived' },
    });
  } catch {
    // Best-effort — see the comment in registerMetricDefinition above.
  }

  return active;
}

import { ProjectModel } from '../models/project.model';
import {
  isMetricAggFunction,
  isMetricDefinitionKind,
  isMetricFilterOperator,
  MetricDefModel,
  type MetricAggregationDef,
  type MetricDefinitionKind,
  type MetricFilterDef,
} from '../models/metric-def.model';
import { ProjectNotFoundError } from './resource-library.service';
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

/** Only arithmetic-expression characters are allowed in a formula body — catches typos/injections early, before the definition is ever compiled (KAN-41). */
const FORMULA_ALLOWED_CHARS_PATTERN = /^[a-z0-9_.\s+\-*/()]+$/;

function hasBalancedParens(formula: string): boolean {
  let depth = 0;
  for (const char of formula) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Every metric-name-shaped identifier referenced in a formula, e.g. `ad_spend / signups` -> `['ad_spend', 'signups']`. */
function extractFormulaReferences(formula: string): string[] {
  const matches = formula.match(/[a-z][a-z0-9_]*/g) ?? [];
  return [...new Set(matches)];
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
  if (!FORMULA_ALLOWED_CHARS_PATTERN.test(formula)) {
    reasons.push('A formula may only reference metric names and the operators + - * / ( ).');
    return undefined;
  }
  if (!hasBalancedParens(formula)) {
    reasons.push('A formula has unbalanced parentheses.');
    return undefined;
  }
  const formulaReferences = extractFormulaReferences(formula);
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
    if (await formulaCreatesCycle(request.organizationId, request.projectId, name, referencedActive)) {
      throw new InvalidMetricDefinitionError([`Formula for "${name}" creates a circular dependency between metrics.`]);
    }
  }

  return { name, definition, dimensions };
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

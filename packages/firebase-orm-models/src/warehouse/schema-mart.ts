import type { SchemaDefKind, SchemaFieldDef, SchemaFieldType } from '../models/schema-def.model';
import { createHash } from 'node:crypto';

/**
 * Pure SQL/name builders for KAN-18's custom-schema marts: every
 * user-registered measure/entity schema gets a BigQuery VIEW over
 * `stg_raw_records` that filters to that schema's rows and extracts each
 * declared field from the JSON payload into a typed column — so a metric
 * registered against `ad_performance_daily` finally has a real relation to
 * query, without any per-schema dbt work.
 *
 * Why name-mangled views in the one shared dataset (Yariv's explicit call,
 * 2026-08-20): schema names are unique only within a project, so two
 * projects can register `ad_performance_daily` with different fields —
 * they can't share one view name. The mangle folds org+project into the
 * name; the metric compiler rewrites a metric's declared table to the
 * mangled name at compile time (`metrics-compiler.service.ts`), so users
 * keep writing plain schema names everywhere. Views are always-fresh reads
 * over raw records — the hourly dbt tick is NOT needed for them.
 */

/** Matches `assertSafeIdentifier`'s vocabulary in @growthos/shared — every generated identifier must survive the compiler's own defensive check. */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class UnsafeMartIdentifierError extends Error {
  constructor(kind: string, value: string) {
    super(`Cannot build a warehouse mart ${kind} from "${value}" — only letters, digits, and underscores are allowed.`);
    this.name = 'UnsafeMartIdentifierError';
  }
}

function assertMartSafe(value: string, kind: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new UnsafeMartIdentifierError(kind, value);
  }
  return value;
}

/**
 * Org/project ids are spliced into single-quoted SQL STRING literals (BigQuery
 * DDL supports no bind parameters), not identifiers — so the constraint is
 * "nothing that can escape a quoted literal", not the identifier grammar.
 * Firestore auto-ids are alphanumeric; dashes/underscores are allowed for
 * hand-assigned ids.
 */
const SAFE_LITERAL_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertLiteralSafe(value: string, kind: string): string {
  if (!SAFE_LITERAL_PATTERN.test(value)) {
    throw new UnsafeMartIdentifierError(kind, value);
  }
  return value;
}

/**
 * `m_<12-hex tenant hash>_<schemaName>` — deterministic, collision-safe
 * across projects (the hash covers org+project), and valid under the
 * compiler's identifier rules. Environment is deliberately NOT part of the
 * name: the view keeps `environment_id` as a column and the compiler's
 * tenant predicate filters it per query, same as every dbt-built table.
 */
export function martViewName(organizationId: string, projectId: string, schemaName: string): string {
  assertMartSafe(schemaName, 'view name');
  const tenantHash = createHash('sha256').update(`${organizationId}:${projectId}`).digest('hex').slice(0, 12);
  return `m_${tenantHash}_${schemaName}`;
}

/**
 * Where a kind's schema-declared fields live inside the stored `payload`.
 * Ingest stores the whole ENVELOPE as `RawRecordModel.payload` and validates
 * declared fields against a sub-object — `checkRecordEnvelope`
 * (`ingest.service.ts`) and `docs/api/ingest.md` §4 are the contract:
 * measures put them in `dimensions`, entities in `attributes`, events in
 * `properties`. Reading `$.<field>` off the envelope's top level (as this
 * builder originally did) yields NULL for every declared column of a
 * correctly-formed record — the same wrong-JSON-level assumption the dbt
 * models carried until they were fixed.
 */
const FIELD_ENVELOPE_OBJECT: Record<SchemaDefKind, string> = {
  measure: 'dimensions',
  entity: 'attributes',
  event: 'properties',
};

function typedJsonExpression(type: SchemaFieldType, jsonPath: string): string {
  const byType: Record<SchemaFieldType, string> = {
    string: `JSON_VALUE(payload, ${jsonPath})`,
    number: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS FLOAT64)`,
    boolean: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS BOOL)`,
    timestamp: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS TIMESTAMP)`,
    object: `JSON_QUERY(payload, ${jsonPath})`,
    array: `JSON_QUERY(payload, ${jsonPath})`,
  };
  return byType[type];
}

/** BigQuery expression extracting one declared field from the `payload` envelope's own field sub-object (see {@link FIELD_ENVELOPE_OBJECT}), typed per the schema's own field type. */
function fieldExpression(field: SchemaFieldDef, kind: SchemaDefKind): string {
  const name = assertMartSafe(field.name, 'column');
  return `${typedJsonExpression(field.type, `'$.${FIELD_ENVELOPE_OBJECT[kind]}.${name}'`)} AS \`${name}\``;
}

/** Which schema kinds get an auto-generated mart view — measures and entities are what registered metrics name as their `table`; events already land in the dbt-built `events` core table. Exported (not just kept local to `schema-mart.service.ts`) so `schema-registry.service.ts` can gate its own reserved-field-name check (see {@link martIntrinsicColumnNames}) on the same kinds, rather than maintaining a second copy of this list that could drift. */
export const MART_KINDS: readonly SchemaDefKind[] = ['measure', 'entity'];

interface MartIntrinsicColumn {
  name: string;
  /** The type a registered metric can rely on for this column — `metric-registry.service.ts` validates an aggregation's `column`/`timeColumn` against these alongside the schema's declared fields. */
  type: SchemaFieldType;
  /** SQL for the column: a bare `stg_raw_records` column, or an extraction out of the envelope. */
  sql: string;
}

/** Carried by every mart regardless of kind: real `stg_raw_records` columns, selected through as-is. */
const COMMON_MART_INTRINSIC_COLUMNS: readonly MartIntrinsicColumn[] = [
  { name: 'organization_id', type: 'string', sql: 'organization_id' },
  { name: 'project_id', type: 'string', sql: 'project_id' },
  { name: 'environment_id', type: 'string', sql: 'environment_id' },
  { name: 'client_id', type: 'string', sql: 'client_id' },
  { name: 'landed_at', type: 'timestamp', sql: 'landed_at' },
];

/**
 * A measure's envelope (`{measure, ts, value, dimensions}`) carries the
 * number the measure is *about* and its event time outside `dimensions` —
 * and `docs/api/ingest.md` §3 tells users not to declare `value` as a schema
 * field or put it in `dimensions`. So without these two, a measure mart
 * built exactly as the docs prescribe has no numeric column to `sum`/`avg`
 * at all, and its only time column is ingest-time `landed_at` (bucketing a
 * backfilled measure on the day it was uploaded rather than the day it
 * describes).
 */
const MEASURE_MART_INTRINSIC_COLUMNS: readonly MartIntrinsicColumn[] = [
  { name: 'value', type: 'number', sql: `${typedJsonExpression('number', "'$.value'")} AS \`value\`` },
  { name: 'ts', type: 'timestamp', sql: `${typedJsonExpression('timestamp', "'$.ts'")} AS \`ts\`` },
];

function martIntrinsicColumnsForKind(kind: SchemaDefKind): readonly MartIntrinsicColumn[] {
  return kind === 'measure' ? [...COMMON_MART_INTRINSIC_COLUMNS, ...MEASURE_MART_INTRINSIC_COLUMNS] : COMMON_MART_INTRINSIC_COLUMNS;
}

/**
 * The columns a mart view of this kind carries alongside the schema's own
 * declared fields (see `buildMartViewSql` below) — a schema declaring a field
 * with one of these names would make the generated view's SELECT list carry
 * two columns sharing a name, which BigQuery rejects outright (`CREATE OR
 * REPLACE VIEW` fails, so the schema registers but its mart never syncs).
 * `schema-registry.service.ts`'s `validateFields` rejects the collision at
 * registration time instead, using this exact list, so it's derived from the
 * emitted columns rather than duplicated as a second hard-coded array that
 * could silently drift.
 */
export function martIntrinsicColumnNames(kind: SchemaDefKind): readonly string[] {
  return martIntrinsicColumnsForKind(kind).map((column) => column.name);
}

/** The intrinsic columns' names and types, for validating a registered metric's `column`/`timeColumn` against the relation the mart actually exposes. */
export function martIntrinsicColumnTypes(kind: SchemaDefKind): ReadonlyMap<string, SchemaFieldType> {
  return new Map(martIntrinsicColumnsForKind(kind).map((column) => [column.name, column.type]));
}

export interface BuildMartViewSqlParams {
  organizationId: string;
  projectId: string;
  kind: SchemaDefKind;
  schemaName: string;
  fieldDefs: readonly SchemaFieldDef[];
  /**
   * The dataset both the view and its `stg_raw_records` source live in
   * (`GROWTHOS_BIGQUERY_CORE_DATASET`, `growthos_core` in the real project).
   * A view's BODY cannot use unqualified table names — unlike an ad-hoc
   * query, a stored view doesn't inherit any `defaultDataset` at query time,
   * so `FROM \`stg_raw_records\`` creates fine but every later SELECT
   * against the view fails with "must be qualified with a dataset" (found
   * live by session-B QA the first time a mart-backed metric was queried,
   * 2026-08-20).
   */
  dataset: string;
}

/**
 * `CREATE OR REPLACE VIEW` DDL for one schema's mart. Both the view name and
 * its `stg_raw_records` source are fully qualified with `dataset` — a stored
 * view's body resolves no `defaultDataset` at query time (unlike an ad-hoc
 * compiled metric query, where the executor's own `defaultDataset` covers an
 * unqualified name), so an unqualified `FROM \`stg_raw_records\`` would
 * create fine but fail every later SELECT against the view (found live by
 * session-B QA, 2026-08-20 — see the fix that added `dataset` to this
 * function's params). Tenant columns stay in the SELECT so the compiler's
 * org/project/environment predicates keep working unchanged; the WHERE also
 * bakes org+project in as defense in depth (a query that somehow skipped the
 * tenant predicate still can't see another project's rows through this
 * view). The intrinsic columns ({@link martIntrinsicColumnNames}) ride along
 * so entities keep an id and every mart has a usable time column even when
 * the schema declares none.
 */
export function buildMartViewSql(params: BuildMartViewSqlParams): string {
  const dataset = assertMartSafe(params.dataset, 'dataset');
  const viewName = martViewName(params.organizationId, params.projectId, params.schemaName);
  const fieldSelects = params.fieldDefs.map((field) => `  ${fieldExpression(field, params.kind)}`);
  // A schema registered before its kind's reserved-name check existed can
  // still declare a field named like an intrinsic column. Emitting both would
  // put two same-named columns in the SELECT and BigQuery would reject the
  // whole view, so the declared field wins — it's the one already-registered
  // metrics resolve against, and `martIntrinsicColumnTypes`' callers resolve
  // the same way.
  const declaredNames = new Set(params.fieldDefs.map((field) => field.name));
  const intrinsicSelects = martIntrinsicColumnsForKind(params.kind)
    .filter((column) => !declaredNames.has(column.name))
    .map((column) => `  ${column.sql}`);
  return [
    `CREATE OR REPLACE VIEW \`${dataset}.${viewName}\` AS`,
    'SELECT',
    [...intrinsicSelects, ...fieldSelects].join(',\n'),
    `FROM \`${dataset}.stg_raw_records\``,
    `WHERE kind = '${params.kind}' AND schema_name = '${assertMartSafe(params.schemaName, 'schema name')}'`,
    `  AND organization_id = '${assertLiteralSafe(params.organizationId, 'organization id')}' AND project_id = '${assertLiteralSafe(params.projectId, 'project id')}'`,
  ].join('\n');
}

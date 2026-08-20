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

/** BigQuery expression extracting one declared field from the `payload` JSON column, typed per the schema's own field type. */
function fieldExpression(field: SchemaFieldDef): string {
  const name = assertMartSafe(field.name, 'column');
  const jsonPath = `'$.${name}'`;
  const byType: Record<SchemaFieldType, string> = {
    string: `JSON_VALUE(payload, ${jsonPath})`,
    number: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS FLOAT64)`,
    boolean: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS BOOL)`,
    timestamp: `SAFE_CAST(JSON_VALUE(payload, ${jsonPath}) AS TIMESTAMP)`,
    object: `JSON_QUERY(payload, ${jsonPath})`,
    array: `JSON_QUERY(payload, ${jsonPath})`,
  };
  return `${byType[field.type]} AS \`${name}\``;
}

/** Which schema kinds get an auto-generated mart view — measures and entities are what registered metrics name as their `table`; events already land in the dbt-built `events` core table. Exported (not just kept local to `schema-mart.service.ts`) so `schema-registry.service.ts` can gate its own reserved-field-name check (see {@link MART_INTRINSIC_COLUMNS}) on the same kinds, rather than maintaining a second copy of this list that could drift. */
export const MART_KINDS: readonly SchemaDefKind[] = ['measure', 'entity'];

/**
 * The columns every mart view carries alongside a schema's own declared
 * fields (see `buildMartViewSql` below) — a measure/entity schema declaring
 * a field with one of these names would make the generated view's SELECT
 * list carry two columns sharing a name, which BigQuery rejects outright
 * (`CREATE OR REPLACE VIEW` fails, so the schema registers but its mart
 * never syncs). `schema-registry.service.ts`'s `validateFields` rejects the
 * collision at registration time instead, using this exact list, so it's
 * exported here rather than duplicated as a second hard-coded array that
 * could silently drift out of sync with the columns actually emitted below.
 */
export const MART_INTRINSIC_COLUMNS: readonly string[] = ['organization_id', 'project_id', 'environment_id', 'client_id', 'landed_at'];

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
 * view). {@link MART_INTRINSIC_COLUMNS} ride along so entities keep an id and
 * every mart has a usable time column even when the schema declares none.
 */
export function buildMartViewSql(params: BuildMartViewSqlParams): string {
  const dataset = assertMartSafe(params.dataset, 'dataset');
  const viewName = martViewName(params.organizationId, params.projectId, params.schemaName);
  const fieldSelects = params.fieldDefs.map((field) => `  ${fieldExpression(field)}`);
  return [
    `CREATE OR REPLACE VIEW \`${dataset}.${viewName}\` AS`,
    'SELECT',
    [...MART_INTRINSIC_COLUMNS.map((column) => `  ${column}`), ...fieldSelects].join(',\n'),
    `FROM \`${dataset}.stg_raw_records\``,
    `WHERE kind = '${params.kind}' AND schema_name = '${assertMartSafe(params.schemaName, 'schema name')}'`,
    `  AND organization_id = '${assertLiteralSafe(params.organizationId, 'organization id')}' AND project_id = '${assertLiteralSafe(params.projectId, 'project id')}'`,
  ].join('\n');
}

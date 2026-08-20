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

export interface BuildMartViewSqlParams {
  organizationId: string;
  projectId: string;
  kind: SchemaDefKind;
  schemaName: string;
  fieldDefs: readonly SchemaFieldDef[];
}

/**
 * `CREATE OR REPLACE VIEW` DDL for one schema's mart. Unqualified names
 * throughout — the executor's `defaultDataset` resolves both the view and
 * `stg_raw_records`, exactly like every compiled metric query. Tenant
 * columns stay in the SELECT so the compiler's org/project/environment
 * predicates keep working unchanged; the WHERE also bakes org+project in as
 * defense in depth (a query that somehow skipped the tenant predicate still
 * can't see another project's rows through this view). `client_id` and
 * `landed_at` ride along so entities keep an id and every mart has a usable
 * time column even when the schema declares none.
 */
export function buildMartViewSql(params: BuildMartViewSqlParams): string {
  const viewName = martViewName(params.organizationId, params.projectId, params.schemaName);
  const fieldSelects = params.fieldDefs.map((field) => `  ${fieldExpression(field)}`);
  return [
    `CREATE OR REPLACE VIEW \`${viewName}\` AS`,
    'SELECT',
    [
      '  organization_id',
      '  project_id',
      '  environment_id',
      '  client_id',
      '  landed_at',
      ...fieldSelects,
    ].join(',\n'),
    'FROM `stg_raw_records`',
    `WHERE kind = '${params.kind}' AND schema_name = '${assertMartSafe(params.schemaName, 'schema name')}'`,
    `  AND organization_id = '${assertLiteralSafe(params.organizationId, 'organization id')}' AND project_id = '${assertLiteralSafe(params.projectId, 'project id')}'`,
  ].join('\n');
}

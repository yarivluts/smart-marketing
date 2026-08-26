import { schemaDefMapKey, type CustomerSearchOutcome, type CustomerSearchResult, type SchemaDefModel, type SchemaFieldDef } from '@growthos/firebase-orm-models';

/** Same fixed redaction placeholder `segment-view.ts`/`record-feed-view.ts` use for the same reason — never actually read an `is_pii` field's real value into a view that reaches the client. */
const REDACTED_VALUE = '••••••';

function stringifyPropertyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export interface CustomerSearchFieldView {
  name: string;
  value: string;
  isPii: boolean;
}

/**
 * One matching entity row, projected for the Customers page's search results (KAN-108). Same
 * "walk the schema's own declared field_defs, never read a PII field's real value into the view"
 * posture `segment-view.ts`'s `toSegmentMemberEntryView` establishes for the exact same
 * `properties`-is-a-flat-field-map shape — `CustomerSearchResult.properties` is the `entities` core
 * table's own `attributes` column, same as `SegmentMemberRow.properties`.
 */
export interface CustomerSearchEntryView {
  entityId: string;
  schemaName: string;
  lastSeenAt: string;
  fields: CustomerSearchFieldView[];
}

export function toCustomerSearchEntryView(result: CustomerSearchResult, fieldDefs: readonly SchemaFieldDef[]): CustomerSearchEntryView {
  const properties = (result.properties ?? {}) as Record<string, unknown>;
  return {
    entityId: result.entityId,
    schemaName: result.schemaName,
    lastSeenAt: result.lastSeenAt,
    fields: fieldDefs.map((fieldDef) => ({
      name: fieldDef.name,
      value: fieldDef.is_pii ? REDACTED_VALUE : stringifyPropertyValue(properties[fieldDef.name]),
      isPii: fieldDef.is_pii,
    })),
  };
}

/** Mirrors `SegmentMemberListView`'s exact ok/degraded-kind split for the same reason — a search results panel degrades the same honest way a segment's member list does rather than crashing the page. */
export type CustomerSearchView =
  | { kind: 'ok'; entries: CustomerSearchEntryView[] }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded' }
  | { kind: 'query_error' };

/**
 * `activeSchemaDefsByKindAndName` is the same precomputed lookup `buildActiveSchemaDefsByKindAndName`
 * builds from a project's already-fetched schema-def list (`segments/page.tsx` established this for
 * its own PII-redaction lookup) — reused here since a search can span every registered entity schema,
 * not just one, so each row's own `schemaName` picks its own field_defs out of the shared map.
 */
export function buildCustomerSearchView(outcome: CustomerSearchOutcome, activeSchemaDefsByKindAndName: ReadonlyMap<string, SchemaDefModel>): CustomerSearchView {
  if (!outcome.ok) {
    return { kind: outcome.reason };
  }
  return {
    kind: 'ok',
    entries: outcome.results.map((result) => {
      const fieldDefs = activeSchemaDefsByKindAndName.get(schemaDefMapKey('entity', result.schemaName))?.field_defs ?? [];
      return toCustomerSearchEntryView(result, fieldDefs);
    }),
  };
}

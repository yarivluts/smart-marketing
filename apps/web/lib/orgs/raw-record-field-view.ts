/**
 * Shared field-coercion helpers for a landed `RawRecordModel`'s declared-fields payload, used by
 * every "project raw-record feed" view mapper (`billing-ops-view.ts`, `churn-feed-view.ts`,
 * `dunning-feed-view.ts`): read one field, falling back to `null`/`false` for a missing or
 * wrongly-typed value rather than throwing, since a landed record is only ever validated against its
 * own schema's declared type at ingest time, not re-validated on every read.
 */

export function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' ? value : null;
}

export function numberField(payload: Record<string, unknown>, field: string): number | null {
  const value = payload[field];
  return typeof value === 'number' ? value : null;
}

export function booleanField(payload: Record<string, unknown>, field: string): boolean {
  return payload[field] === true;
}

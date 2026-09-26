import {
  checkRecordEnvelope,
  IMPLICIT_EVENT_ENVELOPE_FIELDS,
  type RawRecordModel,
  type SchemaFieldDef,
} from '@growthos/firebase-orm-models';

/**
 * The identity keys every event record can carry in its `properties` without the schema declaring
 * them (`IMPLICIT_EVENT_ENVELOPE_FIELDS`: `anon_id`, `customer_id`) — the exact values identity
 * stitching (`bridge_identity`, `fact_attribution`, the funnel query) joins on. The record feed
 * surfaces them on their own labelled line, because a record that renders only its declared fields
 * hides precisely the two values an integrator needs when attribution or the funnel does not join up.
 */
export const RECORD_FEED_IDENTITY_KEYS: readonly string[] = IMPLICIT_EVENT_ENVELOPE_FIELDS;

/** A redaction placeholder standing in for any `is_pii` field's value — never sent to the client at all, unlike `billing-ops-view.ts`'s Stripe-specific fields (none of which are declared PII). */
const REDACTED_VALUE = '••••••';

function stringifyPayloadValue(value: unknown): string {
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

export interface RecordFeedFieldView {
  name: string;
  value: string;
  isPii: boolean;
}

/**
 * A plain, serializable projection of one `RawRecordModel` for the KAN-81 generic record feed. Same
 * "client components can only ever receive plain data" reasoning as `toBillingOpsFeedEntryView`, but
 * schema-agnostic: rather than picking a fixed set of Stripe-shaped fields out of `payload`, this walks
 * the schema's own declared `field_defs` (in registration order) so any registered event schema renders
 * without a dedicated view mapper. A field flagged `is_pii` in the schema never has its actual value
 * read into this view at all (not merely hidden client-side) — `REDACTED_VALUE` is substituted before
 * the projection leaves the server.
 */
export interface RecordFeedEntryView {
  id: string;
  environmentId: string;
  clientId: string;
  landedAt: string;
  fields: RecordFeedFieldView[];
  /**
   * The record's identity keys (`RECORD_FEED_IDENTITY_KEYS`) that are actually present in its
   * `properties`, in that fixed order — empty for a record carrying neither, and always empty for a
   * non-event record (only events carry the implicit envelope fields). A key the schema explicitly
   * declares `is_pii` is redacted exactly like any other PII field. Declared identity keys appear
   * here rather than also in `fields`, so the same value never renders twice.
   */
  identity: RecordFeedFieldView[];
}

function isIdentityKey(name: string): boolean {
  return RECORD_FEED_IDENTITY_KEYS.includes(name);
}

/**
 * The field names the record feed's filter may offer for one schema: its declared non-PII fields
 * (identity keys excluded, they get their own group) and, for an event schema, the identity keys —
 * unless the schema itself declares one `is_pii`, in which case filtering on it would round-trip a
 * PII value through the page's own query string. The server-side filter already reads these from
 * the same `properties` map (`matchesFieldFilter` in `pipeline.service.ts`), so no query change is
 * needed for an undeclared identity key to be filterable.
 */
export function recordFeedFilterOptions(
  kind: RawRecordModel['kind'],
  fieldDefs: readonly SchemaFieldDef[],
): { declared: string[]; identity: string[] } {
  const piiNames = new Set(fieldDefs.filter((fieldDef) => fieldDef.is_pii).map((fieldDef) => fieldDef.name));
  return {
    declared: fieldDefs
      .filter((fieldDef) => !fieldDef.is_pii && (kind !== 'event' || !isIdentityKey(fieldDef.name)))
      .map((fieldDef) => fieldDef.name),
    identity: kind === 'event' ? RECORD_FEED_IDENTITY_KEYS.filter((name) => !piiNames.has(name)) : [],
  };
}

export function toRecordFeedEntryView(record: RawRecordModel, fieldDefs: readonly SchemaFieldDef[]): RecordFeedEntryView {
  // A landed `RawRecordModel.payload` is the *whole* ingest envelope as submitted (an event's own
  // `event_id`/`event`/`ts` alongside its `properties`, an entity's `id` alongside its `attributes`,
  // a measure's `measure`/`ts`/`value` alongside its `dimensions`) — not a flat map of the schema's
  // declared fields. Reusing `checkRecordEnvelope` (the same dispatch `ingestBatch` itself validates
  // against) rather than reading `payload[fieldDef.name]` directly avoids re-introducing the bug this
  // fix corrects: every declared field silently rendering blank for any record landed through the real
  // ingest path (only caught once a real end-to-end record — not a hand-built flat-payload test
  // fixture — was rendered through this view).
  const { fieldsToValidate } = checkRecordEnvelope(record.kind, record.payload);
  const isEvent = record.kind === 'event';
  const piiNames = new Set(fieldDefs.filter((fieldDef) => fieldDef.is_pii).map((fieldDef) => fieldDef.name));
  const identity: RecordFeedFieldView[] = isEvent
    ? RECORD_FEED_IDENTITY_KEYS.flatMap((name) => {
        const value = stringifyPayloadValue(fieldsToValidate[name]);
        if (value === '') {
          return [];
        }
        const isPii = piiNames.has(name);
        return [{ name, value: isPii ? REDACTED_VALUE : value, isPii }];
      })
    : [];
  return {
    id: record.id,
    environmentId: record.environment_id,
    clientId: record.client_id,
    landedAt: record.landed_at,
    fields: fieldDefs
      .filter((fieldDef) => !isEvent || !isIdentityKey(fieldDef.name))
      .map((fieldDef) => ({
        name: fieldDef.name,
        value: fieldDef.is_pii ? REDACTED_VALUE : stringifyPayloadValue(fieldsToValidate[fieldDef.name]),
        isPii: fieldDef.is_pii,
      })),
    identity,
  };
}

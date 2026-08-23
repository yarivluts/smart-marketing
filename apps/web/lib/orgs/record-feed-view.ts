import { checkRecordEnvelope, type RawRecordModel, type SchemaFieldDef } from '@growthos/firebase-orm-models';

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
  return {
    id: record.id,
    environmentId: record.environment_id,
    clientId: record.client_id,
    landedAt: record.landed_at,
    fields: fieldDefs.map((fieldDef) => ({
      name: fieldDef.name,
      value: fieldDef.is_pii ? REDACTED_VALUE : stringifyPayloadValue(fieldsToValidate[fieldDef.name]),
      isPii: fieldDef.is_pii,
    })),
  };
}

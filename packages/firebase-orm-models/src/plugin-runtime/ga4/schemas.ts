import type { SchemaFieldInput } from '../../services/schema-registry.service';
import { DuplicateSchemaDefinitionError, registerSchemaDefinition } from '../../services/schema-registry.service';

/** Event schema names this connector lands (plan `13 §E8.4`: "sessions, events, UTM ... capture"). Both are day-bucketed rollups from GA4's own aggregated reporting API (not raw per-user hits — see the connector's own doc comment in `executor.ts`), so each is naturally an append-only fact, not a current-state entity. */
export const GA4_SESSION_EVENT_NAME = 'ga4_session';
export const GA4_EVENT_EVENT_NAME = 'ga4_event';

const SESSION_FIELDS: SchemaFieldInput[] = [
  { name: 'date', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'source', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'medium', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'campaign', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'channel_group', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'sessions', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'engaged_sessions', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'new_users', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'total_users', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
];

const EVENT_FIELDS: SchemaFieldInput[] = [
  { name: 'date', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'event_name', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'channel_group', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'event_count', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'total_users', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
];

/** `(kind, name, fields)` for every schema this connector needs — the single source of truth {@link ensureGa4SchemasRegistered} registers from. */
export const GA4_SCHEMAS: readonly { kind: 'event'; name: string; fields: SchemaFieldInput[] }[] = [
  { kind: 'event', name: GA4_SESSION_EVENT_NAME, fields: SESSION_FIELDS },
  { kind: 'event', name: GA4_EVENT_EVENT_NAME, fields: EVENT_FIELDS },
];

/**
 * Idempotently registers every schema this connector lands into (KAN-52),
 * so a project installing the GA4 plugin doesn't need an admin to
 * hand-register two schemas before its first sync can land anything. The
 * same "safe to call on every run, never re-registers or overwrites"
 * posture `ensureStripeCommerceSchemasRegistered` (KAN-49) already
 * established for its own connector.
 */
export async function ensureGa4SchemasRegistered(organizationId: string, projectId: string, createdByUserId: string): Promise<void> {
  await Promise.all(
    GA4_SCHEMAS.map(async ({ kind, name, fields }) => {
      try {
        await registerSchemaDefinition({ organizationId, projectId, kind, name, fields, createdByUserId });
      } catch (error) {
        if (error instanceof DuplicateSchemaDefinitionError) {
          return;
        }
        throw error;
      }
    }),
  );
}

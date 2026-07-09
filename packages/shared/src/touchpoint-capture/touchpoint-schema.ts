/** The event kind + schema name every touchpoint capture payload registers/validates under (`08 §1`/KAN-56's own `bridge_identity` convention: "anonymous" is defined structurally as a `touchpoint`-kind event's own client id). */
export const TOUCHPOINT_SCHEMA_KIND = 'event' as const;
export const TOUCHPOINT_SCHEMA_NAME = 'touchpoint';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared` has
 * no dependency on that package, so this is a small structurally-identical
 * type the consumer maps into the real one at the registration call site.
 */
export interface TouchpointSchemaFieldSpec {
  name: string;
  type: 'string';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The touchpoint event's registerable field list, mirroring exactly the
 * properties `build-touchpoint-event.ts` ever emits. `click_id` is the only
 * identity key here — the tracker collects no device fingerprint or email at
 * the anonymous stage, so it's the one field an anon-side touchpoint and a
 * later customer-side event can plausibly share (KAN-56's `shared_key:click_id`
 * link type).
 */
export const TOUCHPOINT_SCHEMA_FIELDS: readonly TouchpointSchemaFieldSpec[] = [
  { name: 'click_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
  { name: 'utm_source', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'utm_medium', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'utm_campaign', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'utm_content', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'utm_term', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'landing_page', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'referrer', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'channel', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

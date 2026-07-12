/** The event kind + schema name our own dogfood activation-funnel events register/validate under (KAN-70 AC: "our own GrowthOS project tracks activation of design partners", dogfooding the KAN-32 Ingest API against ourselves). */
export const ACTIVATION_EVENT_SCHEMA_KIND = 'event' as const;
export const ACTIVATION_EVENT_SCHEMA_NAME = 'growthos_activation';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — same posture as
 * `TouchpointSchemaFieldSpec`: `packages/shared` has no dependency on that
 * package, so the consumer maps this into the real one at the registration
 * call site.
 */
export interface ActivationSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The activation funnel a design partner walks through in the onboarding
 * wizard (KAN-68, plan `10 §2.6` steps 1-5), in wizard order. `onboarding_
 * completed` is the AC's own "activation" moment — a design partner reaching
 * a populated starter board.
 */
export const ACTIVATION_FUNNEL_STEPS = [
  'onboarding_started',
  'pack_selected',
  'source_connected',
  'funnel_confirmed',
  'onboarding_completed',
] as const;
export type ActivationFunnelStep = (typeof ACTIVATION_FUNNEL_STEPS)[number];

export function isActivationFunnelStep(value: string): value is ActivationFunnelStep {
  return (ACTIVATION_FUNNEL_STEPS as readonly string[]).includes(value);
}

/**
 * The activation event's registerable field list, mirroring exactly the
 * properties `build-activation-event.ts` ever emits. Deliberately no
 * `isIdentityKey` fields — unlike `touchpoint`, this event isn't part of
 * KAN-56's identity-stitching graph; `target_organization_id`/`target_
 * project_id` identify *which design partner* a funnel step belongs to, not
 * an anonymous visitor to be stitched to a later customer record.
 */
export const ACTIVATION_SCHEMA_FIELDS: readonly ActivationSchemaFieldSpec[] = [
  { name: 'funnel_step', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'target_organization_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'target_project_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'pack_key', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'source_connection_method', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'funnel_step_count', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
];

/**
 * The demo/meeting lifecycle event a calendar/CRM-style connector (or a
 * manual admin action) would send (plan `14 §Gap 9`, KAN-92 slice 1: "demo/
 * meeting events in the SaaS pack"). One schema, four `stage` values on the
 * same field list — `scheduled` (a demo gets booked, `rep_org_person_id`
 * typically already known — the rep who booked it), `held` (the demo
 * happened), `no_show` (the prospect didn't attend), and `canceled` — the
 * same "one schema, stage-specific optional fields" shape
 * `SUPPORT_TICKET_SCHEMA_FIELDS` (KAN-90) already establishes for its own
 * `stage`-discriminated payload. A real calendar/CRM connector is
 * deferred — needs a human-provisioned API key, same posture Stripe/GA4/
 * KAN-82/KAN-84/KAN-87/KAN-90 established for their own third-party
 * connectors — this schema is what any future connector (or a manual admin
 * action) would land data under. We do not build a CRM — we read/write to
 * one (plan `14` Gap 9's own framing).
 */
export const DEMO_EVENT_SCHEMA_KIND = 'event' as const;
export const DEMO_EVENT_SCHEMA_NAME = 'demo_event';

export const DEMO_EVENT_STAGES = ['scheduled', 'held', 'no_show', 'canceled'] as const;
export type DemoEventStage = (typeof DEMO_EVENT_STAGES)[number];

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `SupportTicketSchemaFieldSpec`
 * (KAN-90) / `ExperimentSchemaFieldSpec` (KAN-89) establish. The consumer
 * maps it to the real type at the registration call site.
 */
export interface DemoEventSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * `rep_org_person_id` is the rep who booked/owns the demo — unlike a
 * support ticket's `agent_org_person_id` (typically null until resolution),
 * a demo's rep is usually already known at `scheduled` time, so every stage
 * can carry it. `account_name` is a free-text company/account label for the
 * "recent demos" feed to display — a business identifier, not personal data
 * about an individual, so it isn't flagged PII (consistent with how other
 * schemas in this codebase flag only individual-identifying fields).
 */
export const DEMO_EVENT_SCHEMA_FIELDS: readonly DemoEventSchemaFieldSpec[] = [
  { name: 'demo_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'stage', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'rep_org_person_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'account_name', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

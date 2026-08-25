/**
 * The support-ticket lifecycle event a Zendesk/Intercom/Freshdesk/Crisp-style
 * connector (or an in-app helpdesk widget) would send (plan `14 §Gap 6`,
 * KAN-90 slice 1). One schema, two `stage` values on the same field list —
 * `opened` (a ticket lands, `agent_org_person_id` typically still null —
 * unassigned) and `resolved` (the agent who closed it, plus the time deltas
 * and CSAT score computed by whatever ingests the lifecycle data), the same
 * "one schema, stage-specific optional fields" shape `SURVEY_RESPONSE_SCHEMA_FIELDS`
 * (KAN-82) already establishes for its own `survey_type`-discriminated
 * payload. A real connector is deferred — needs a human-provisioned API key,
 * same posture Stripe/GA4/KAN-82/KAN-84/KAN-87 established for their own
 * third-party connectors — this schema is what any future connector (or a
 * manual admin action) would land data under.
 */
export const SUPPORT_TICKET_SCHEMA_KIND = 'event' as const;
export const SUPPORT_TICKET_SCHEMA_NAME = 'support_ticket_event';

export const SUPPORT_TICKET_STAGES = ['opened', 'resolved'] as const;
export type SupportTicketStage = (typeof SUPPORT_TICKET_STAGES)[number];

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `ExperimentSchemaFieldSpec`
 * (KAN-89) / `SurveyResponseSchemaFieldSpec` (KAN-82) establish. The consumer
 * maps it to the real type at the registration call site.
 */
export interface SupportTicketSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * `first_response_seconds`/`resolution_seconds`/`csat_score` only ever land
 * on a `resolved`-stage event — the ingesting connector/admin action
 * computes the elapsed-time deltas itself rather than this codebase
 * deriving them from a separate `opened` event via a dbt self-join, the same
 * "the client already knows its own state" tradeoff `EXPERIMENT_SCHEMA_FIELDS`'s
 * own doc comment documents for `experiment_key`/`variant_key`. None of
 * these fields is required — an `opened`-stage event only ever sets
 * `ticket_id`/`stage` (`agent_org_person_id` stays null until assignment).
 */
export const SUPPORT_TICKET_SCHEMA_FIELDS: readonly SupportTicketSchemaFieldSpec[] = [
  { name: 'ticket_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'stage', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'agent_org_person_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'first_response_seconds', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'resolution_seconds', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'csat_score', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
];

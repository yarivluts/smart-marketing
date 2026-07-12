import type { IngestEventRecord } from '../touchpoint-capture/types';
import { ACTIVATION_EVENT_SCHEMA_NAME, type ActivationFunnelStep } from './activation-schema';

/** The flat ingest-event `properties` shape one activation-funnel event's payload validates against (see `activation-schema.ts`). */
export interface ActivationEventProperties {
  funnel_step: ActivationFunnelStep;
  target_organization_id: string;
  target_project_id: string;
  pack_key?: string;
  source_connection_method?: string;
  funnel_step_count?: number;
}

export interface BuildActivationEventPayloadInput {
  /** A fresh id per call — unlike a touchpoint's `anonId`-as-`event_id` reuse, one design partner's project fires this event once per funnel step, so each call needs its own id or later steps would dedupe away under `ingest.service.ts`'s `(kind, event_name, client_id)` key. */
  eventId: string;
  ts: string;
  funnelStep: ActivationFunnelStep;
  targetOrganizationId: string;
  targetProjectId: string;
  packKey?: string;
  sourceConnectionMethod?: string;
  funnelStepCount?: number;
}

/**
 * Builds the `POST /v1/ingest/events` record for one activation-funnel event, fired into our own
 * internal analytics project (KAN-70) whenever a design partner advances through the onboarding
 * wizard (KAN-68). Only fields the caller actually supplied are included — same "absent, not
 * present-but-undefined" reasoning as `buildTouchpointEventPayload`.
 */
export function buildActivationEventPayload(
  input: BuildActivationEventPayloadInput,
): IngestEventRecord<ActivationEventProperties> {
  const properties: ActivationEventProperties = {
    funnel_step: input.funnelStep,
    target_organization_id: input.targetOrganizationId,
    target_project_id: input.targetProjectId,
  };
  if (input.packKey) properties.pack_key = input.packKey;
  if (input.sourceConnectionMethod) properties.source_connection_method = input.sourceConnectionMethod;
  if (typeof input.funnelStepCount === 'number') properties.funnel_step_count = input.funnelStepCount;

  return {
    event_id: input.eventId,
    event: ACTIVATION_EVENT_SCHEMA_NAME,
    ts: input.ts,
    properties,
  };
}

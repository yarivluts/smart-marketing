import type { AcquisitionParams, IngestEventRecord, TouchpointEventProperties } from './types';
import { TOUCHPOINT_SCHEMA_NAME } from './touchpoint-schema';

export interface BuildTouchpointEventPayloadInput {
  /** The visitor's persistent anonymous id, reused as this event's own `event_id` — a touchpoint event's client id *is* the anon id every downstream reader (KAN-56's `bridge_identity`) keys off, not a separate field. */
  anonId: string;
  ts: string;
  params: AcquisitionParams;
}

/**
 * Builds the `POST /v1/ingest/events` record for one touchpoint-capture event
 * (KAN-57 AC: "storing UTM/click-ids at entry"). Only fields
 * `parseAcquisitionParams` actually found are included — the ingest schema
 * validator (`validateAgainstSchema`) treats a present-but-`undefined` value
 * as a type mismatch, not an absent optional field, so `undefined` entries
 * must never make it into `properties` at all.
 */
export function buildTouchpointEventPayload(input: BuildTouchpointEventPayloadInput): IngestEventRecord<TouchpointEventProperties> {
  const { params } = input;
  const properties: TouchpointEventProperties = {};
  if (params.clickId) properties.click_id = params.clickId;
  if (params.utmSource) properties.utm_source = params.utmSource;
  if (params.utmMedium) properties.utm_medium = params.utmMedium;
  if (params.utmCampaign) properties.utm_campaign = params.utmCampaign;
  if (params.utmContent) properties.utm_content = params.utmContent;
  if (params.utmTerm) properties.utm_term = params.utmTerm;
  if (params.landingPage) properties.landing_page = params.landingPage;
  if (params.referrer) properties.referrer = params.referrer;
  if (params.channel) properties.channel = params.channel;

  return {
    event_id: input.anonId,
    event: TOUCHPOINT_SCHEMA_NAME,
    ts: input.ts,
    properties,
  };
}

/**
 * Acquisition signal captured at a visitor's entry to a site (plan `04 §1`'s
 * `fact_touchpoint`: `channel_id, campaign_id, ad_id, click_id{gclid,fbclid,ttclid},
 * utm{source,medium,campaign,content,term}, landing_page`). Every field is
 * optional — a direct/organic visit carries none of them, which is itself a
 * meaningful (if sparse) touchpoint.
 */
export interface AcquisitionParams {
  clickId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrer?: string;
  channel?: string;
}

/** The flat ingest-event `properties` shape a touchpoint event's payload validates against (see `touchpoint-schema.ts`). */
export interface TouchpointEventProperties {
  click_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page?: string;
  referrer?: string;
  channel?: string;
}

/** The `POST /v1/ingest/events` batch-record envelope (`ingest-request.ts`'s `{ event_id, event, ts, properties }` shape), kept generic over its own `properties` type so both the touchpoint builder and the tracked-event builder can reuse it. */
export interface IngestEventRecord<TProperties = Record<string, unknown>> {
  event_id: string;
  event: string;
  ts: string;
  properties: TProperties;
}

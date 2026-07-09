import type { IngestEventRecord } from './types';

export interface BuildTrackedEventPayloadInput {
  /** A fresh id per call (the tracker generates a UUID) — unlike the touchpoint event, a custom event fires repeatedly, so it must never reuse the anon id as its own `event_id` (that would dedupe every event after the first under the same `(kind, event_name, client_id)` key — see `ingest.service.ts`'s dedup-key comment). */
  eventId: string;
  eventName: string;
  ts: string;
  /** The visitor's anon id, attached as an `anon_id` property (KAN-57 AC's other half: "attached to ingest events") so any event fired through the same tracker — anonymous or, once `identify()` is called, customer-attributed — carries evidence back to its originating touchpoint (KAN-56's `anon_id_cooccurrence` link). Omitted if the tracker has no persisted anon id yet. */
  anonId?: string;
  properties?: Readonly<Record<string, unknown>>;
}

/** Builds the `POST /v1/ingest/events` record for a `.track()`/`.identify()` call. */
export function buildTrackedEventPayload(input: BuildTrackedEventPayloadInput): IngestEventRecord {
  const properties: Record<string, unknown> = { ...(input.properties ?? {}) };
  if (input.anonId) {
    properties.anon_id = input.anonId;
  }
  return {
    event_id: input.eventId,
    event: input.eventName,
    ts: input.ts,
    properties,
  };
}

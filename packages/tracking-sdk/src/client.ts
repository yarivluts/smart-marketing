import { buildTouchpointEventPayload, buildTrackedEventPayload, parseAcquisitionParams } from '@growthos/shared';
import {
  ANON_ID_STORAGE_KEY,
  CUSTOMER_ID_STORAGE_KEY,
  ensureStoredId,
  generateId,
  readStoredId,
  resolveStorage,
  type KeyValueStorage,
} from './storage';

export interface TrackerOptions {
  /** An `ingest.write`-scoped project API key (KAN-28/30) — safe to expose client-side, the same posture Segment/GA write keys take, since the ingest API accepts no other permission with it. */
  writeKey: string;
  /** The GrowthOS ingest API's base URL, e.g. `https://api.example.com/v1/ingest` — everything up to (not including) `/events`. */
  ingestBaseUrl: string;
  /** Test/embed-environment overrides — production callers never need these. */
  storage?: KeyValueStorage;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export interface Tracker {
  /** Captures UTM/click-ids from the current URL and fires exactly one touchpoint event per visitor — the first `page()`/`track()`/`identify()` call this browser ever makes (KAN-57 AC: "storing UTM/click-ids at entry"). A no-op on every later call: the visitor's first touchpoint is permanent, not overwritten by a later visit. */
  page(): Promise<void>;
  /** Sends a custom event, attaching the visitor's anon id (and, once `identify()` has been called, their customer id) so it links back to the touchpoint that acquired them (KAN-57 AC's other half: "attached to ingest events"). */
  track(eventName: string, properties?: Record<string, unknown>): Promise<void>;
  /** Associates the current anon id with a known customer id, persisted for the rest of this browser's session so every subsequent `track()` call also carries it. */
  identify(customerId: string, traits?: Record<string, unknown>): Promise<void>;
  /** The visitor's persisted anon id, or `null` if `page()`/`track()`/`identify()` has never run yet. */
  getAnonId(): string | null;
}

function defaultNow(): string {
  return new Date().toISOString();
}

/**
 * Creates a GrowthOS touchpoint-capture tracker (KAN-57). This is the
 * programmatic form of the embeddable snippet (`renderEmbedSnippet` in
 * `snippet.ts`) — the same capture/attach behavior, for a site that already
 * bundles JS rather than pasting a `<script>` tag.
 */
export function createTracker(options: TrackerOptions): Tracker {
  const storage = resolveStorage(options.storage);
  const fetchImpl = options.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  const now = options.now ?? defaultNow;

  async function send(records: readonly unknown[]): Promise<void> {
    if (!fetchImpl) {
      return;
    }
    try {
      await fetchImpl(`${options.ingestBaseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.writeKey}` },
        body: JSON.stringify({ batch: records }),
        keepalive: true,
      });
    } catch {
      // A dropped network call must never throw into the host page — the same
      // "best-effort, never break the caller" posture the server-side ingest
      // pipeline itself takes for its own non-critical writes.
    }
  }

  function currentUrl(): string {
    const location = (globalThis as { location?: Location }).location;
    return location?.href ?? 'https://unknown.invalid/';
  }

  function currentReferrer(): string | undefined {
    const document = (globalThis as { document?: Document }).document;
    return document?.referrer && document.referrer.length > 0 ? document.referrer : undefined;
  }

  async function page(): Promise<void> {
    const { id: anonId, isNew } = ensureStoredId(storage, ANON_ID_STORAGE_KEY);
    if (!isNew) {
      return;
    }
    const params = parseAcquisitionParams({ url: currentUrl(), referrer: currentReferrer() });
    await send([buildTouchpointEventPayload({ anonId, ts: now(), params })]);
  }

  async function track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    const { id: anonId } = ensureStoredId(storage, ANON_ID_STORAGE_KEY);
    const customerId = readStoredId(storage, CUSTOMER_ID_STORAGE_KEY);
    const mergedProperties = { ...(properties ?? {}) };
    if (customerId) {
      mergedProperties.customer_id = customerId;
    }
    await send([buildTrackedEventPayload({ eventId: generateId(), eventName, ts: now(), anonId, properties: mergedProperties })]);
  }

  async function identify(customerId: string, traits?: Record<string, unknown>): Promise<void> {
    storage.setItem(CUSTOMER_ID_STORAGE_KEY, customerId);
    await track('identify', { ...(traits ?? {}), customer_id: customerId });
  }

  function getAnonId(): string | null {
    return readStoredId(storage, ANON_ID_STORAGE_KEY);
  }

  return { page, track, identify, getAnonId };
}

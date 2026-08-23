import {
  buildTouchpointEventPayload,
  buildTrackedEventPayload,
  CANCELLATION_REASON_SCHEMA_NAME,
  computeSignupQualityScore,
  ONBOARDING_SURVEY_SCHEMA_NAME,
  parseAcquisitionParams,
  SURVEY_RESPONSE_SCHEMA_NAME,
  type OnboardingSurveyAnswers,
} from '@growthos/shared';
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
  /** Sends an NPS survey response (KAN-82's in-app survey SDK) — a thin `track()` wrapper over the `survey_response` schema, same posture `identify()` takes over its own `track()` call. `score` is 0-10; `comment` is the respondent's optional free text. */
  submitNpsSurvey(score: number, comment?: string): Promise<void>;
  /** Sends a cancellation reason from a cancel flow or exit survey (KAN-84) — a thin `track()` wrapper over the `cancellation_reason` schema, same posture `submitNpsSurvey` takes over its own `track()` call. `reasonCode` should be one of `CANCELLATION_REASON_CODES` (`@growthos/shared`); `comment` is the customer's optional free text. */
  submitCancellationReason(reasonCode: string, comment?: string): Promise<void>;
  /**
   * Sends an onboarding-survey response from a signup flow (KAN-83, plan `14
   * §Gap 4`) — a thin `track()` wrapper over the `onboarding_survey` schema,
   * same posture `submitNpsSurvey`/`submitCancellationReason` take over their
   * own `track()` call. Unlike those two, this computes
   * `computeSignupQualityScore(answers)` itself and lands the resulting
   * `quality_score` alongside the raw answers, *before* sending — so the
   * landed event is already flat/scored and the `fact_signup_quality_score`
   * dbt mart needs no SQL-side scoring logic to flatten it into a real
   * column (same "compute before send" posture that field's own doc comment
   * documents). This is this codebase's one "AI" score computed client-side
   * rather than server-side/warehouse-side — a deliberate simplification: a
   * production version might move this to a server-side scoring call once a
   * real model exists, trading the client's ability to see its own score
   * immediately for not trusting the client's arithmetic.
   */
  submitOnboardingSurvey(answers: OnboardingSurveyAnswers): Promise<void>;
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

  /**
   * Mints the anon id on this browser's first-ever call, firing its
   * touchpoint capture at that exact moment — shared by `page()`, `track()`,
   * and `identify()` so *whichever one a caller happens to invoke first*
   * still captures the entry touchpoint, rather than only `page()` doing so
   * (a caller that only ever calls `track()`/`identify()` would otherwise
   * silently mint an anon id with no touchpoint ever recorded for it, and
   * every later `page()` call would then see the id already exists and skip).
   */
  async function ensureAnonId(): Promise<string> {
    const { id: anonId, isNew } = ensureStoredId(storage, ANON_ID_STORAGE_KEY);
    if (isNew) {
      const params = parseAcquisitionParams({ url: currentUrl(), referrer: currentReferrer() });
      await send([buildTouchpointEventPayload({ anonId, ts: now(), params })]);
    }
    return anonId;
  }

  async function page(): Promise<void> {
    await ensureAnonId();
  }

  async function track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    const anonId = await ensureAnonId();
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

  async function submitNpsSurvey(score: number, comment?: string): Promise<void> {
    const properties: Record<string, unknown> = { survey_type: 'nps', score };
    if (comment !== undefined) {
      properties.comment = comment;
    }
    await track(SURVEY_RESPONSE_SCHEMA_NAME, properties);
  }

  async function submitCancellationReason(reasonCode: string, comment?: string): Promise<void> {
    const properties: Record<string, unknown> = { reason_code: reasonCode };
    if (comment !== undefined) {
      properties.comment = comment;
    }
    await track(CANCELLATION_REASON_SCHEMA_NAME, properties);
  }

  async function submitOnboardingSurvey(answers: OnboardingSurveyAnswers): Promise<void> {
    const { score } = computeSignupQualityScore(answers);
    const properties: Record<string, unknown> = {
      company_size: answers.companySize,
      budget_range: answers.budgetRange,
      urgency: answers.urgency,
      quality_score: score,
    };
    if (answers.useCase !== undefined) {
      properties.use_case = answers.useCase;
    }
    await track(ONBOARDING_SURVEY_SCHEMA_NAME, properties);
  }

  return { page, track, identify, getAnonId, submitNpsSurvey, submitCancellationReason, submitOnboardingSurvey };
}

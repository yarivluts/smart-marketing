import { parseAcquisitionParams, type AcquisitionParams } from '@growthos/touchpoint-capture';

export const DEFAULT_API = 'https://api-prod-1098891924957.me-west1.run.app';
export const SDK_VERSION = '0.1.1';

/** A new visit starts after this much inactivity (the usual web-analytics session length). */
export const VISIT_TIMEOUT_MS = 30 * 60 * 1000;

const ANON_KEY = 'growthos_anon_id';
const CUSTOMER_KEY = 'growthos_customer_id';
const VISIT_KEY = 'growthos_visit';
const MAX_BUFFER = 200;

export type Consent = 'granted' | 'pending' | 'denied';
type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type Properties = Record<string, Value>;

export interface GrowthOSBrowserOptions {
  /** A publishable (browser) key, gos_pk_live_... / gos_pk_test_..., whose allowed origins include this site. Not needed with `endpoint`. */
  key?: string;
  /** The GrowthOS API (default: production). */
  api?: string;
  /**
   * Send to your own relay instead of GrowthOS (e.g. '/api/growth' with @growthos/node's
   * createRelayHandler) - for sites whose Content-Security-Policy only allows their own origin.
   */
  endpoint?: string;
  /** Send a touchpoint (campaign attribution: utm_*, click ids, landing page, referrer) at the start of each visit. Default true. */
  touchpoint?: boolean;
  /** Send `page_view` on load and on every in-app navigation. Register a `page_view` schema first. Default false. */
  pageViews?: boolean;
  /** `pending`: nothing is stored or sent until `consent('granted')`. Default `granted`. */
  consent?: Consent;
  /** Log every send and every rejected record (with the reason) to the console. */
  debug?: boolean;
  /** Send after this many events wait (default 10) or this long after the first (default 1000 ms). */
  flushAt?: number;
  flushIntervalMs?: number;
}

export interface QueuedEvent {
  event_id: string;
  event: string;
  ts: string;
  properties: Properties;
}

export interface SendResult {
  accepted: number;
  quarantined: number;
  duplicates: number;
  rejected: { client_id: string; status: string; reasons?: string[] }[];
}

interface Visit {
  id: string;
  lastActivity: number;
  /** The campaign the visit came from; a link with another campaign starts a new visit. */
  campaign: string;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** localStorage / sessionStorage that never throws (private mode, blocked cookies, quota). */
function safeStorage(
  kind: 'local' | 'session',
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const memory = new Map<string, string>();
  const fallback = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  };
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__growthos__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return fallback;
  }
}

/** The touchpoint properties of the registered `touchpoint` schema, from the parsed landing URL. */
function touchpointProperties(params: AcquisitionParams): Properties {
  const entries: [string, string | undefined][] = [
    ['click_id', params.clickId],
    ['utm_source', params.utmSource],
    ['utm_medium', params.utmMedium],
    ['utm_campaign', params.utmCampaign],
    ['utm_content', params.utmContent],
    ['utm_term', params.utmTerm],
    ['landing_page', params.landingPage],
    ['referrer', params.referrer],
    ['channel', params.channel],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function campaignKey(params: AcquisitionParams): string {
  return [params.clickId, params.utmSource, params.utmMedium, params.utmCampaign]
    .filter(Boolean)
    .join('|');
}

/**
 * The browser client. Use the singleton through `window.GrowthOS` (script tag) or
 * `init()` from the npm package; `new GrowthOSBrowser()` is for tests and multiple instances.
 */
export class GrowthOSBrowser {
  private options: Required<
    Pick<
      GrowthOSBrowserOptions,
      'touchpoint' | 'pageViews' | 'debug' | 'flushAt' | 'flushIntervalMs'
    >
  > &
    GrowthOSBrowserOptions;
  private consentState: Consent;
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly local = safeStorage('local');
  private readonly session = safeStorage('session');
  private listening = false;
  private lastPage: string | null = null;

  constructor(options: GrowthOSBrowserOptions) {
    if (!options.key && !options.endpoint)
      throw new Error('GrowthOS: init needs a publishable key (or a relay endpoint).');
    if (options.key && !options.key.startsWith('gos_pk_')) {
      throw new Error(
        'GrowthOS: a web page must use a publishable (browser) key, gos_pk_live_... / gos_pk_test_... - never a secret key. Mint one on the Keys page.',
      );
    }
    this.options = {
      touchpoint: true,
      pageViews: false,
      debug: false,
      flushAt: 10,
      flushIntervalMs: 1000,
      ...options,
    };
    this.consentState = options.consent ?? 'granted';
    if (this.consentState === 'denied') return;
    if (this.consentState === 'granted') this.start();
  }

  // ---- Public API -----------------------------------------------------------------------------

  /** Sends an event. Its name must be a registered event schema, and every property declared on it. */
  track(event: string, properties: Properties = {}, options: { eventId?: string } = {}): void {
    if (this.consentState === 'denied' || !event) return;
    this.touchVisit();
    this.enqueue({
      event_id: options.eventId ?? uuid(),
      event,
      ts: new Date().toISOString(),
      properties: { ...properties, ...this.identity() },
    });
  }

  /**
   * Sends `page_view` with `path` plus only the properties you pass. Nothing else is added: a
   * property the project's page_view schema does not declare would quarantine every page view
   * (`page({ title: document.title })` when the schema has `title`).
   */
  page(properties: Properties = {}): void {
    if (typeof location === 'undefined') return;
    this.lastPage = location.pathname + location.search;
    this.track('page_view', { path: location.pathname, ...properties });
  }

  /** Who the visitor is (after login/signup): every later event carries this customer id, which ties the visit's attribution to the customer. */
  identify(customerId: string): void {
    if (this.consentState === 'denied' || !customerId) return;
    this.local.setItem(CUSTOMER_KEY, customerId);
  }

  /** On logout: forgets the customer and starts a new anonymous visitor. */
  reset(): void {
    this.local.removeItem(CUSTOMER_KEY);
    this.local.removeItem(ANON_KEY);
    this.session.removeItem(VISIT_KEY);
  }

  /** The anonymous visitor id - pass it to your server at signup (with @growthos/node: `track({ anonId })`) so the signup is credited to this visit's campaign. */
  getAnonId(): string | null {
    if (this.consentState !== 'granted') return null;
    return this.anonId();
  }

  /** The campaign this visit came from (utm_*, click id, landing page, referrer, channel). */
  getAttribution(): Properties {
    return touchpointProperties(this.acquisition());
  }

  /** Grants or withdraws consent. Granting sends what was waiting; denying drops it and clears stored ids. */
  consent(state: Consent): void {
    const previous = this.consentState;
    this.consentState = state;
    if (state === 'denied') {
      this.queue = [];
      this.reset();
      return;
    }
    if (state === 'granted' && previous !== 'granted') {
      // Events tracked while pending had no identity yet: give them one now.
      const waiting = this.queue.map((event) => ({
        ...event,
        properties: { ...event.properties, ...this.identity() },
      }));
      this.queue = [];
      this.start();
      waiting.forEach((event) => this.enqueue(event));
    }
  }

  /** Sends what is waiting now. Resolves with what GrowthOS did (null when sent by beacon or nothing was waiting). */
  async flush(useBeacon = false): Promise<SendResult | null> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.consentState !== 'granted' || this.queue.length === 0) return null;
    const batch = this.queue.splice(0, 100);
    const result = await this.send(batch, useBeacon);
    if (this.queue.length) void this.flush(useBeacon);
    return result;
  }

  /**
   * The installation check from the browser console: whether this key works from this page and,
   * for each expected schema, what really arrived (receiving, quarantined, not registered ...).
   */
  async verify(expect: string[] = ['touchpoint']): Promise<unknown> {
    if (!this.options.key)
      throw new Error(
        'GrowthOS: verify() needs the publishable key (a relay endpoint has no check).',
      );
    const response = await fetch(
      `${this.api()}/v1/ingest/verify?key=${encodeURIComponent(this.options.key)}&expect=${encodeURIComponent(expect.join(','))}`,
      { credentials: 'omit' },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `status ${response.status}`;
      console.error(`[GrowthOS] verify failed: ${message}`);
      return body;
    }
    const report = (
      body as {
        report?: {
          status: string;
          schemas: { name: string; status: string; fix: string | null }[];
        };
      }
    ).report;
    if (report && typeof console.table === 'function') {
      console.info(`[GrowthOS] installation: ${report.status}`);
      console.table(
        report.schemas.map((schema) => ({
          schema: schema.name,
          status: schema.status,
          fix: schema.fix ?? '',
        })),
      );
    }
    return body;
  }

  // ---- Internals ------------------------------------------------------------------------------

  private start(): void {
    if (this.options.touchpoint) this.ensureVisit();
    if (this.options.pageViews) this.page();
    this.listen();
  }

  private api(): string {
    return (this.options.api ?? DEFAULT_API).replace(/\/+$/, '');
  }

  private anonId(): string {
    let id = this.local.getItem(ANON_KEY);
    if (!id) {
      id = uuid();
      this.local.setItem(ANON_KEY, id);
    }
    return id;
  }

  private identity(): Properties {
    if (this.consentState !== 'granted') return {};
    const customerId = this.local.getItem(CUSTOMER_KEY);
    return { anon_id: this.anonId(), ...(customerId ? { customer_id: customerId } : {}) };
  }

  private acquisition(): AcquisitionParams {
    return parseAcquisitionParams({ url: location.href, referrer: document.referrer });
  }

  private readVisit(): Visit | null {
    try {
      const raw = this.session.getItem(VISIT_KEY);
      return raw ? (JSON.parse(raw) as Visit) : null;
    } catch {
      return null;
    }
  }

  /**
   * Starts a visit - and sends its touchpoint first, as the contract requires - when there is none
   * in this tab, the last one went quiet for 30 minutes, or the visitor arrived on a link with
   * another campaign. Otherwise only marks activity.
   */
  private ensureVisit(): void {
    const now = Date.now();
    const acquisition = this.acquisition();
    const campaign = campaignKey(acquisition);
    const visit = this.readVisit();
    const expired = !visit || now - visit.lastActivity > VISIT_TIMEOUT_MS;
    const newCampaign = Boolean(campaign) && visit !== null && campaign !== visit.campaign;
    if (expired || newCampaign) {
      const next: Visit = { id: uuid(), lastActivity: now, campaign };
      this.session.setItem(VISIT_KEY, JSON.stringify(next));
      this.enqueue({
        event_id: next.id,
        event: 'touchpoint',
        ts: new Date(now).toISOString(),
        properties: { ...touchpointProperties(acquisition), ...this.identity() },
      });
      return;
    }
    this.session.setItem(VISIT_KEY, JSON.stringify({ ...visit, lastActivity: now }));
  }

  private touchVisit(): void {
    if (this.consentState === 'granted' && this.options.touchpoint) this.ensureVisit();
  }

  private enqueue(event: QueuedEvent): void {
    if (this.queue.length >= MAX_BUFFER) this.queue.shift();
    this.queue.push(event);
    if (this.consentState !== 'granted') return;
    if (this.queue.length >= this.options.flushAt) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.options.flushIntervalMs);
    }
  }

  /** Page exit sends what is left by beacon; SPA navigation sends page views when asked to. */
  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const leave = () => void this.flush(true);
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') leave();
    });
    if (this.options.pageViews) {
      const onNavigate = () => {
        const current = location.pathname + location.search;
        if (current !== this.lastPage) this.page();
      };
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = history[method].bind(history);
        history[method] = ((...args: Parameters<History['pushState']>) => {
          original(...args);
          onNavigate();
        }) as History['pushState'];
      }
      window.addEventListener('popstate', onNavigate);
    }
  }

  private url(): string {
    if (this.options.endpoint) return this.options.endpoint;
    return `${this.api()}/v1/ingest/events?key=${encodeURIComponent(this.options.key as string)}`;
  }

  /**
   * text/plain JSON with the key in the URL: no CORS preflight, and the one form sendBeacon
   * takes (the only send that survives the page closing). Retried twice on a network error,
   * 429 or 5xx; anything else is reported in debug mode and dropped.
   */
  private async send(batch: QueuedEvent[], useBeacon: boolean): Promise<SendResult | null> {
    const body = JSON.stringify({ batch });
    if (
      useBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      if (navigator.sendBeacon(this.url(), new Blob([body], { type: 'text/plain' }))) {
        if (this.options.debug) console.info(`[GrowthOS] sent ${batch.length} event(s) by beacon`);
        return null;
      }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(this.url(), {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'text/plain' },
          keepalive: body.length < 60_000,
          credentials: 'omit',
        });
        const result = (await response.json().catch(() => null)) as
          (SendResult & { message?: string }) | null;
        if (response.ok) {
          this.report(batch, result);
          return result;
        }
        if (response.status !== 429 && response.status < 500) {
          console.error(
            `[GrowthOS] events refused (${response.status}): ${result?.message ?? 'check the key and its allowed origins'}`,
          );
          return null;
        }
      } catch {
        // Network error: retry below.
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    if (this.options.debug)
      console.warn(`[GrowthOS] could not send ${batch.length} event(s); they were dropped`);
    return null;
  }

  private report(batch: QueuedEvent[], result: SendResult | null): void {
    if (!result) return;
    for (const rejected of result.rejected ?? []) {
      if (rejected.status !== 'quarantined') continue;
      const event = batch.find((entry) => entry.event_id === rejected.client_id);
      // Always shown: a rejected record is a broken install, not noise.
      console.warn(
        `[GrowthOS] "${event?.event ?? rejected.client_id}" was rejected: ${(rejected.reasons ?? []).join(', ')}`,
      );
    }
    if (this.options.debug)
      console.info(
        `[GrowthOS] sent ${batch.length}: ${result.accepted} accepted, ${result.quarantined} rejected, ${result.duplicates} duplicates`,
      );
  }
}

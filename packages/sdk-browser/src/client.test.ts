import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrowthOSBrowser, VISIT_TIMEOUT_MS } from './client';

const KEY = 'gos_pk_live_abc';
const API = 'https://api.test';

interface Sent {
  url: string;
  batch: { event_id: string; event: string; ts: string; properties: Record<string, unknown> }[];
  init: RequestInit;
}

function answer(batch: Sent['batch'], rejected: unknown[] = []) {
  return new Response(
    JSON.stringify({
      batch_id: 'b',
      kind: 'event',
      accepted: batch.length - rejected.length,
      quarantined: rejected.length,
      duplicates: 0,
      total: batch.length,
      rejected,
    }),
    { status: 202 },
  );
}

let sent: Sent[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sent = [];
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const batch = (JSON.parse(String(init.body)) as { batch: Sent['batch'] }).batch;
    sent.push({ url, batch, init });
    return answer(batch);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function client(options: Partial<ConstructorParameters<typeof GrowthOSBrowser>[0]> = {}) {
  return new GrowthOSBrowser({ key: KEY, api: API, flushIntervalMs: 0, ...options });
}

describe('GrowthOS browser', () => {
  it('starts a visit with a touchpoint carrying the campaign, then events with the anon id inside properties', async () => {
    const growthos = client();
    growthos.track('cta_click', { cta: 'hero_signup' });
    await growthos.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${API}/v1/ingest/events?key=${KEY}`);
    // text/plain: no CORS preflight.
    expect((sent[0].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    const [touchpoint, click] = sent[0].batch;
    const anonId = growthos.getAnonId();
    expect(touchpoint).toMatchObject({
      event: 'touchpoint',
      properties: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'lawyers',
        click_id: 'abc',
        channel: 'paid_search',
        landing_page: 'https://www.easysign.example/pricing',
        anon_id: anonId,
      },
    });
    // One touchpoint per visit, not per browser: its id is the visit's, never the visitor's.
    expect(touchpoint.event_id).not.toBe(anonId);
    expect(click).toMatchObject({
      event: 'cta_click',
      properties: { cta: 'hero_signup', anon_id: anonId },
    });
  });

  it('sends one touchpoint per visit: a new one after 30 quiet minutes, none while the visit continues', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    const first = client();
    first.track('cta_click');
    await first.flush();
    // A reload in the same visit: no second touchpoint.
    const reload = client();
    reload.track('cta_click');
    await reload.flush();
    vi.setSystemTime(new Date(Date.now() + VISIT_TIMEOUT_MS + 1000));
    const later = client();
    await later.flush();
    const touchpoints = sent
      .flatMap((call) => call.batch)
      .filter((event) => event.event === 'touchpoint');
    expect(touchpoints).toHaveLength(2);
    expect(touchpoints[0].event_id).not.toBe(touchpoints[1].event_id);
  });

  it('after identify, every event carries the customer id; reset forgets it and the visitor', async () => {
    const growthos = client({ touchpoint: false });
    const anonBefore = growthos.getAnonId();
    growthos.identify('user-1');
    growthos.track('document_created', { document_id: 'd1' }, { eventId: 'doc-d1' });
    await growthos.flush();
    expect(sent[0].batch[0]).toEqual(
      expect.objectContaining({
        event_id: 'doc-d1',
        properties: { document_id: 'd1', anon_id: anonBefore, customer_id: 'user-1' },
      }),
    );
    growthos.reset();
    expect(growthos.getAnonId()).not.toBe(anonBefore);
    growthos.track('page_view');
    await growthos.flush();
    expect(sent[1].batch[0].properties.customer_id).toBeUndefined();
  });

  it('with consent pending stores and sends nothing; granting sends what waited, denying drops it', async () => {
    const growthos = client({ consent: 'pending' });
    growthos.track('cta_click');
    await growthos.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('growthos_anon_id')).toBeNull();
    expect(growthos.getAnonId()).toBeNull();
    growthos.consent('granted');
    await growthos.flush();
    const events = sent.flatMap((call) => call.batch).map((event) => event.event);
    expect(events).toEqual(['touchpoint', 'cta_click']);
    expect(sent[0].batch[1].properties.anon_id).toBe(growthos.getAnonId());

    const declined = client({ consent: 'pending' });
    declined.track('cta_click');
    declined.consent('denied');
    await declined.flush();
    expect(sent).toHaveLength(1);
  });

  it('sends what is left by beacon when the page is hidden, with the key in the URL', () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
    const growthos = client({ flushIntervalMs: 60_000 });
    growthos.track('cta_click');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe(`${API}/v1/ingest/events?key=${KEY}`);
    expect(blob.type).toBe('text/plain');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('shows every rejected record with its reason, and retries a 503 but not a 403', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const batch = (JSON.parse(String(init.body)) as { batch: Sent['batch'] }).batch;
      return answer(batch, [
        {
          client_id: batch[0].event_id,
          status: 'quarantined',
          reasons: ['schema_not_registered:cta_clik'],
        },
      ]);
    });
    const growthos = client({ touchpoint: false });
    growthos.track('cta_clik');
    await growthos.flush();
    expect(warn).toHaveBeenCalledWith(
      '[GrowthOS] "cta_clik" was rejected: schema_not_registered:cta_clik',
    );

    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 503 }));
    growthos.track('cta_click');
    const pending = growthos.flush();
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            message: 'This publishable key does not allow requests from https://x.test',
          }),
          { status: 403 },
        ),
    );
    growthos.track('cta_click');
    await growthos.flush();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(error.mock.calls[0][0]).toContain('does not allow requests from https://x.test');
  });

  it('sends to a relay when given an endpoint, and refuses a secret key in a page', async () => {
    const relayed = new GrowthOSBrowser({
      endpoint: '/api/growth',
      touchpoint: false,
      flushIntervalMs: 0,
    });
    relayed.track('cta_click');
    await relayed.flush();
    expect(sent[0].url).toBe('/api/growth');
    expect(() => new GrowthOSBrowser({ key: 'gos_live_secret' })).toThrow('publishable');
    expect(() => new GrowthOSBrowser({})).toThrow();
  });

  it('page views on load and on in-app navigation when asked', async () => {
    const growthos = client({ pageViews: true, touchpoint: false });
    history.pushState({}, '', '/features');
    await growthos.flush();
    const paths = sent
      .flatMap((call) => call.batch)
      .filter((event) => event.event === 'page_view')
      .map((event) => event.properties.path);
    expect(paths).toEqual(['/pricing', '/features']);
  });
});

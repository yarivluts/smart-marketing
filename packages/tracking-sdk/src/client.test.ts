import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker } from './client';
import { createInMemoryStorage } from './storage';

function navigateTo(url: string, referrer?: string): void {
  window.history.pushState({}, '', url);
  Object.defineProperty(document, 'referrer', { value: referrer ?? '', configurable: true });
}

describe('createTracker', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    navigateTo('https://shop.example.com/');
  });

  it('page(): fires exactly one touchpoint event, capturing a gclid from the URL', async () => {
    navigateTo('https://shop.example.com/landing?gclid=abc123&utm_source=google&utm_medium=cpc');
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.page();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/ingest/events');
    expect(requestInit.headers.Authorization).toBe('Bearer gos_test_abc');
    const body = JSON.parse(requestInit.body);
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0].event).toBe('touchpoint');
    expect(body.batch[0].event_id).toBe(tracker.getAnonId());
    expect(body.batch[0].properties).toMatchObject({ click_id: 'abc123', channel: 'paid_search' });
  });

  it('page(): is a no-op on a second call — the first touchpoint is permanent', async () => {
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.page();
    const anonIdAfterFirst = tracker.getAnonId();
    navigateTo('https://shop.example.com/other-landing?fbclid=zzz');
    await tracker.page();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(tracker.getAnonId()).toBe(anonIdAfterFirst);
  });

  it('track(): attaches the persisted anon id to a custom event', async () => {
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.page();
    await tracker.track('viewed_pricing', { plan: 'pro' });

    const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(body.batch[0].event).toBe('viewed_pricing');
    expect(body.batch[0].properties.plan).toBe('pro');
    expect(body.batch[0].properties.anon_id).toBe(tracker.getAnonId());
  });

  it('identify(): persists the customer id so every later track() call also carries it', async () => {
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.page();
    await tracker.identify('cust_42', { plan: 'pro' });
    await tracker.track('purchase', { amount: 99 });

    const identifyBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(identifyBody.batch[0].event).toBe('identify');
    expect(identifyBody.batch[0].properties.customer_id).toBe('cust_42');

    const purchaseBody = JSON.parse(fetchImpl.mock.calls[2][1].body);
    expect(purchaseBody.batch[0].properties.customer_id).toBe('cust_42');
    expect(purchaseBody.batch[0].properties.amount).toBe(99);
  });

  it('track(): fires the entry touchpoint itself when called before page() ever runs (regression: a caller that only ever calls track()/identify() must not lose the visitor\'s touchpoint)', async () => {
    navigateTo('https://shop.example.com/landing?gclid=first_call_gclid');
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.track('viewed_pricing');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const touchpointBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(touchpointBody.batch[0].event).toBe('touchpoint');
    expect(touchpointBody.batch[0].properties.click_id).toBe('first_call_gclid');
    expect(touchpointBody.batch[0].event_id).toBe(tracker.getAnonId());

    // A later page() call must not re-fire it — the anon id already exists.
    await tracker.page();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('identify(): fires the entry touchpoint itself when called before page()/track() ever runs', async () => {
    navigateTo('https://shop.example.com/landing?fbclid=identify_first_fbclid');
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await tracker.identify('cust_1');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const touchpointBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(touchpointBody.batch[0].event).toBe('touchpoint');
    expect(touchpointBody.batch[0].properties.click_id).toBe('identify_first_fbclid');
  });

  it('never lets a rejected fetch reject the caller — best-effort delivery', async () => {
    fetchImpl.mockRejectedValue(new Error('network down'));
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });

    await expect(tracker.page()).resolves.toBeUndefined();
  });

  it('getAnonId(): returns null before any capture/track call has run', () => {
    const storage = createInMemoryStorage();
    const tracker = createTracker({ writeKey: 'gos_test_abc', ingestBaseUrl: 'https://api.example.com/v1/ingest', storage, fetchImpl });
    expect(tracker.getAnonId()).toBeNull();
  });
});

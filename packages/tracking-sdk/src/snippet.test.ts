import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEmbedSnippetBody, renderEmbedSnippet } from './snippet';

declare global {
  interface Window {
    growthos?: {
      page: () => void;
      track: (eventName: string, properties?: Record<string, unknown>) => void;
      identify: (customerId: string, traits?: Record<string, unknown>) => void;
      getAnonId: () => string | null;
    };
  }
}

function navigateTo(url: string, referrer = ''): void {
  window.history.pushState({}, '', url);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

/** Executes the exact JS body `renderEmbedSnippet` ships, in this test's own jsdom `window` — not a parallel reimplementation, the real generated code. */
function runSnippet(options: Parameters<typeof buildEmbedSnippetBody>[0]): void {
  new Function(buildEmbedSnippetBody(options))();
}

describe('buildEmbedSnippetBody (the real embeddable <script> content)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    delete window.growthos;
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    navigateTo('https://shop.example.com/');
  });

  it('captures a gclid at entry and posts it to the ingest API, keyed by a fresh anon id', () => {
    navigateTo('https://shop.example.com/landing?gclid=snippet_gclid_1&utm_campaign=spring');
    runSnippet({ writeKey: 'gos_test_key', ingestBaseUrl: 'https://api.example.com/v1/ingest' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/ingest/events');
    expect(requestInit.headers.Authorization).toBe('Bearer gos_test_key');
    const body = JSON.parse(requestInit.body as string);
    expect(body.batch[0].event).toBe('touchpoint');
    expect(body.batch[0].properties.click_id).toBe('snippet_gclid_1');
    expect(body.batch[0].properties.channel).toBe('paid_search');
    expect(body.batch[0].event_id).toBe(window.growthos?.getAnonId());
  });

  it('exposes window.growthos.track(), attaching the anon id to a later conversion event', () => {
    navigateTo('https://shop.example.com/landing?gclid=snippet_gclid_2');
    runSnippet({ writeKey: 'gos_test_key', ingestBaseUrl: 'https://api.example.com/v1/ingest' });
    const anonId = window.growthos?.getAnonId();

    window.growthos?.track('signup', { plan: 'pro' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const signupBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(signupBody.batch[0].event).toBe('signup');
    expect(signupBody.batch[0].properties.anon_id).toBe(anonId);
    expect(signupBody.batch[0].properties.plan).toBe('pro');
  });

  it('does not fire a second touchpoint on a later page with different acquisition params', () => {
    runSnippet({ writeKey: 'gos_test_key', ingestBaseUrl: 'https://api.example.com/v1/ingest' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const anonId = window.growthos?.getAnonId();

    navigateTo('https://shop.example.com/second-visit?fbclid=zzz');
    runSnippet({ writeKey: 'gos_test_key', ingestBaseUrl: 'https://api.example.com/v1/ingest' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.growthos?.getAnonId()).toBe(anonId);
  });
});

describe('renderEmbedSnippet', () => {
  it('wraps the snippet body in a copy-pasteable <script> tag', () => {
    const rendered = renderEmbedSnippet({ writeKey: 'gos_test_key', ingestBaseUrl: 'https://api.example.com/v1/ingest' });
    expect(rendered.startsWith('<script>')).toBe(true);
    expect(rendered.trimEnd().endsWith('</script>')).toBe(true);
    expect(rendered).toContain('gos_test_key');
    expect(rendered).toContain('https://api.example.com/v1/ingest');
  });
});

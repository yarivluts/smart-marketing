// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fetchLandingPage, LANDING_PAGE_MAX_BYTES } from './planning-sources';

vi.mock('server-only', () => ({}));

/** Every host resolves to a public documentation address unless a test says otherwise. */
const publicResolver = vi.fn(async () => ['93.184.215.14']);

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

function redirect(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

const PAGE = '<html><head><title>EasySign</title><meta name="description" content="Sign fast"></head><body><h1>Sign in 30 seconds</h1><p>For lawyers.</p></body></html>';

describe('fetchLandingPage', () => {
  it('reads a public page over https without credentials, following the SSRF guard', async () => {
    const fetchImpl = vi.fn(async () => html(PAGE));
    const page = await fetchLandingPage('https://example.com/lawyers', { fetchImpl, resolver: publicResolver });
    expect(page).toEqual({
      status: 'ok',
      url: 'https://example.com/lawyers',
      title: 'EasySign',
      description: 'Sign fast',
      headings: ['Sign in 30 seconds'],
      text: 'Sign in 30 seconds For lawyers.',
      truncated: false,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('with no URL says so; an http URL is read over https, never plain http', async () => {
    expect(await fetchLandingPage(null)).toEqual({ status: 'unavailable', reason: 'no_url' });
    const fetchImpl = vi.fn(async (_url: string) => html(PAGE));
    await fetchLandingPage('http://example.com/lawyers', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: publicResolver });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/lawyers');
  });

  it('refuses private, loopback and metadata addresses before any request', async () => {
    const fetchImpl = vi.fn(async () => html(PAGE));
    expect(await fetchLandingPage('https://169.254.169.254/latest/meta-data', { fetchImpl })).toEqual({ status: 'unavailable', reason: 'blocked_url' });
    expect(await fetchLandingPage('https://intranet.example.com/', { fetchImpl, resolver: async () => ['10.0.0.5'] })).toEqual({ status: 'unavailable', reason: 'blocked_url' });
    expect(await fetchLandingPage('https://user:pass@example.com/', { fetchImpl, resolver: publicResolver })).toEqual({ status: 'unavailable', reason: 'blocked_url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('re-checks every redirect hop: a redirect into a private network is refused', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://127.0.0.1/admin'));
    expect(await fetchLandingPage('https://example.com/go', { fetchImpl, resolver: publicResolver })).toEqual({ status: 'unavailable', reason: 'blocked_url' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows a relative redirect and reports the final URL, but gives up after three hops', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect('/he/lawyers', 302)).mockResolvedValueOnce(html(PAGE));
    expect(await fetchLandingPage('https://example.com/lawyers', { fetchImpl, resolver: publicResolver })).toMatchObject({ status: 'ok', url: 'https://example.com/he/lawyers' });

    const loop = vi.fn(async () => redirect('https://example.com/again'));
    expect(await fetchLandingPage('https://example.com/start', { fetchImpl: loop, resolver: publicResolver })).toEqual({ status: 'unavailable', reason: 'too_many_redirects' });
    expect(loop).toHaveBeenCalledTimes(4);
  });

  it('an error status, a non-HTML response, an empty page and a network failure each have their own reason', async () => {
    const run = (response: Response | Error) =>
      fetchLandingPage('https://example.com/', { fetchImpl: vi.fn(async () => (response instanceof Error ? Promise.reject(response) : response)), resolver: publicResolver });
    expect(await run(html('gone', { status: 404 }))).toEqual({ status: 'unavailable', reason: 'http_error' });
    expect(await run(new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }))).toEqual({ status: 'unavailable', reason: 'not_html' });
    expect(await run(html('<html><body><script>app()</script></body></html>'))).toEqual({ status: 'unavailable', reason: 'empty_page' });
    expect(await run(new TypeError('fetch failed'))).toEqual({ status: 'unavailable', reason: 'fetch_failed' });
  });

  it('reads at most the size cap of a huge page', async () => {
    const huge = `<html><body><h1>Top</h1><p>${'a '.repeat(LANDING_PAGE_MAX_BYTES)}</p><h2>Past the cap</h2></body></html>`;
    const page = await fetchLandingPage('https://example.com/', { fetchImpl: vi.fn(async () => html(huge)), resolver: publicResolver });
    expect(page).toMatchObject({ status: 'ok', headings: ['Top'], truncated: true });
  });
});

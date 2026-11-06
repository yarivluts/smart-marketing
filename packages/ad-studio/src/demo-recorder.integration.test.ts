// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromiumPath, createPlaywrightDemoLauncher } from './demo-browser';
import { encodeDemoFrames, runDemoTour } from './demo-recorder';
import { defaultFfmpegRunner, probeMedia } from './ffmpeg';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The real browser against a tiny local app: a sign-in form and three pages. Runs only where a
 * Chromium binary (CHROMIUM_PATH, default /usr/bin/chromium) and ffmpeg are installed. The public
 * address guard is replaced for this test only, since the app is on loopback.
 */
const browserAvailable = existsSync(chromiumPath()) && spawnSync(defaultFfmpegRunner().ffmpegPath, ['-version']).status === 0;

const PASSWORD = 'local-trial-password';
const hits: { method: string; url: string }[] = [];

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><style>body{font-family:sans-serif;margin:0}nav a,nav button{margin:8px}main{height:2200px;padding:24px;background:linear-gradient(#eef,#fee)}</style></head><body><nav><a href="/app">Dashboard</a><a href="/app/reports">Reports</a><a href="/app/contacts">Contacts</a><a href="/logout">Log out</a><button onclick="fetch('/delete',{method:'POST'})">Delete everything</button></nav><main><h1>${title}</h1>${body}</main></body></html>`;
}

function handler(request: IncomingMessage, response: ServerResponse): void {
  hits.push({ method: request.method ?? 'GET', url: request.url ?? '' });
  const signedIn = (request.headers.cookie ?? '').includes('session=ok');
  if (request.url === '/login' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html' }).end(
      '<!doctype html><title>Sign in</title><form method="post" action="/session"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form>',
    );
    return;
  }
  if (request.url === '/session' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const ok = new URLSearchParams(body).get('password') === PASSWORD;
      response.writeHead(303, ok ? { location: '/app', 'set-cookie': 'session=ok; Path=/' } : { location: '/login' }).end();
    });
    return;
  }
  if (request.url?.startsWith('/app') && signedIn) {
    const title = request.url === '/app/reports' ? 'Reports' : request.url === '/app/contacts' ? 'Contacts' : 'Dashboard';
    response.writeHead(200, { 'content-type': 'text/html' }).end(page(title, `<p>${title} content</p><table><tr><td>Row</td></tr></table>`));
    return;
  }
  response.writeHead(request.url?.startsWith('/app') ? 302 : 404, request.url?.startsWith('/app') ? { location: '/login' } : {}).end();
}

let server: Server;
let origin = '';

describe.skipIf(!browserAvailable)('walkthrough recorder with a real browser', () => {
  beforeAll(async () => {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('signs in, tours the app without clicking anything denied, and encodes an MP4', { timeout: 240_000 }, async () => {
    const plan = ['Reports', 'Delete everything', 'Contacts'];
    const result = await runDemoTour({
      launchBrowser: createPlaywrightDemoLauncher(),
      credentials: { loginUrl: `${origin}/login`, username: 'trial@example.com', password: PASSWORD },
      context: { productDescription: 'A CRM', notes: '', language: 'en' },
      decideStep: async (_system, user) => {
        const wanted = plan.shift();
        const index = wanted ? new RegExp(`^(\\d+)\\. \\[\\w+\\] ${wanted}\\b`, 'm').exec(user)?.[1] : undefined;
        return wanted ? { action: index ? 'click' : 'scroll', element: index ? Number(index) : null, title: wanted, description: `The ${wanted} page.` } : { action: 'done', element: null, title: '', description: '' };
      },
      // Loopback is allowed for this local app only.
      checkAddress: async (url) => {
        if (!url.startsWith(origin)) throw new Error('not the local app');
      },
      now: () => Date.now(),
      dwellMs: 1200,
    });

    expect(result.segments.map((segment) => segment.title)).toEqual(['Reports', 'Delete everything', 'Contacts']);
    expect(result.frames.length).toBeGreaterThan(3);
    // Signed in once; nothing was posted afterwards and nothing denied was followed.
    expect(hits.filter((hit) => hit.method === 'POST').map((hit) => hit.url)).toEqual(['/session']);
    expect(hits.some((hit) => hit.url === '/logout')).toBe(false);
    expect(hits.some((hit) => hit.url === '/app/reports')).toBe(true);

    const runner = defaultFfmpegRunner();
    const video = await encodeDemoFrames(result, runner);
    const dir = await mkdtemp(path.join(tmpdir(), 'demo-int-'));
    try {
      const file = path.join(dir, 'out.mp4');
      await writeFile(file, video);
      const probe = await probeMedia(file, runner);
      expect(probe.hasVideo).toBe(true);
      expect(probe.durationSeconds).toBeGreaterThan(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a wrong password as login_failed', { timeout: 120_000 }, async () => {
    await expect(
      runDemoTour({
        launchBrowser: createPlaywrightDemoLauncher(),
        credentials: { loginUrl: `${origin}/login`, username: 'trial@example.com', password: 'wrong' },
        context: { productDescription: '', notes: '', language: 'en' },
        decideStep: async () => ({ action: 'done', element: null, title: '', description: '' }),
        checkAddress: async () => undefined,
        now: () => Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'login_failed' });
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
  revealAdStudioDemoAccess: vi.fn(),
  listAdStudioDemoRecordings: vi.fn(),
  listAdStudioBriefs: vi.fn(),
  createAdStudioDemoRecording: vi.fn(),
  markAdStudioDemoRecordingReady: vi.fn(),
  markAdStudioDemoRecordingFailed: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));

import type { AdStudioLlm } from './llm';
import { createMemoryMediaStorage } from './media-storage';
import {
  AdStudioDemoRequestError,
  buildDemoEncodeArgs,
  buildFrameList,
  chooseDemoSegments,
  clickableForTour,
  DemoRecorderError,
  recordProductWalkthrough,
  redactSecrets,
  runDemoTour,
  type DemoBrowserOptions,
  type DemoClickable,
  type DemoDriver,
} from './demo-recorder';

const PASSWORD = 'S3cret-Trial!';
const credentials = { loginUrl: 'https://app.example.com/login', username: 'trial@example.com', password: PASSWORD };
const context = { productDescription: 'Invoicing for freelancers', notes: '', language: 'en' };

const PAGES: Record<string, { title: string; clickables: DemoClickable[] }> = {
  'https://app.example.com/home': {
    title: 'Home',
    clickables: [
      { index: 1, role: 'link', name: 'Invoices', href: '/invoices', inForm: false },
      { index: 2, role: 'button', name: 'Delete account', href: null, inForm: false },
      { index: 3, role: 'link', name: 'Partner site', href: 'https://other.com/', inForm: false },
      { index: 4, role: 'button', name: 'Apply', href: null, inForm: true },
      { index: 5, role: 'link', name: 'Log out', href: '/logout', inForm: false },
    ],
  },
  'https://app.example.com/invoices': { title: 'Invoices', clickables: [{ index: 1, role: 'link', name: 'Home', href: '/home', inForm: false }] },
};

/** A fake browser on a fake clock: every wait moves the clock, every scroll emits frames. */
function fakeBrowser(options: { loginWorks?: boolean; form?: boolean; open?: boolean } = {}) {
  let clock = 1_000_000;
  let url = '';
  let loggedIn = false;
  let onFrame: ((jpeg: Buffer) => void) | null = null;
  const clicks: number[] = [];
  const typed: string[] = [];
  let launched: DemoBrowserOptions | null = null;
  const closed = vi.fn();
  const driver: DemoDriver = {
    async open(target) {
      url = target;
      return options.open ?? true;
    },
    url: () => url,
    async login({ username, password }) {
      if (options.form === false) return 'no_form';
      typed.push(username, password);
      clock += 1000;
      if (options.loginWorks ?? true) {
        url = 'https://app.example.com/home';
        loggedIn = true;
      }
      return 'submitted';
    },
    passwordFieldVisible: async () => !loggedIn,
    lockForms: async () => undefined,
    async snapshot() {
      const page = PAGES[url] ?? { title: 'Unknown', clickables: [] };
      return { url, title: page.title, headings: [page.title], clickables: page.clickables };
    },
    async click(index) {
      clicks.push(index);
      const target = PAGES[url]?.clickables.find((element) => element.index === index);
      if (target?.href) url = new URL(target.href, url).toString();
      return true;
    },
    settle: async () => {
      clock += 500;
    },
    async scroll(_pixels, durationMs) {
      for (let at = 0; at < durationMs; at += 100) {
        clock += 100;
        onFrame?.(Buffer.from(`frame@${clock}`));
      }
    },
    async startCapture(listener) {
      onFrame = listener;
    },
    stopCapture: async () => {
      onFrame = null;
    },
    close: async () => closed(),
  };
  return {
    launch: vi.fn(async (opts: DemoBrowserOptions) => {
      launched = opts;
      return driver;
    }),
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
      onFrame?.(Buffer.from(`frame-while-waiting@${clock}`));
    },
    clicks,
    typed,
    closed,
    options: () => launched as DemoBrowserOptions | null,
  };
}

function steps(...answers: { action: 'click' | 'scroll' | 'done'; element?: number | null; title?: string }[]) {
  return vi.fn(async () => {
    const next = answers.shift() ?? { action: 'done' as const };
    return { action: next.action, element: next.element ?? null, title: next.title ?? 'Moment', description: 'Shows it.' };
  });
}

const allowAddress = async () => undefined;

describe('runDemoTour', () => {
  it('signs in, records only after sign-in, and cuts the tour into timed moments', async () => {
    const browser = fakeBrowser();
    const decide = steps({ action: 'scroll', title: 'Dashboard' }, { action: 'click', element: 1, title: 'Invoices' }, { action: 'done' });
    const result = await runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: decide, checkAddress: allowAddress, now: browser.now, dwellMs: 3000 });
    expect(result.segments.map((segment) => [segment.title, segment.startSeconds, segment.endSeconds])).toEqual([
      ['Dashboard', 0, 3],
      ['Invoices', 3.5, 6.5],
    ]);
    expect(result.durationMs).toBe(6500);
    expect(result.frames.length).toBeGreaterThan(10);
    // The first frame is from after sign-in: the clock had already passed the login.
    expect(result.frames[0].atMs).toBeGreaterThanOrEqual(0);
    expect(browser.clicks).toEqual([1]);
    expect(browser.closed).toHaveBeenCalled();
    expect(result.site).toBe('example.com');
  });

  it('pauses the recording while the guide decides, so the video never shows the wait', async () => {
    const browser = fakeBrowser();
    const answers = [{ action: 'scroll' as const, title: 'Dashboard' }, { action: 'click' as const, element: 1, title: 'Invoices' }];
    const decide = vi.fn(async () => {
      browser.advance(10_000);
      const next = answers.shift();
      return next ? { action: next.action, element: 'element' in next ? next.element : null, title: next.title, description: '' } : { action: 'done' as const, element: null, title: '', description: '' };
    });
    const result = await runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: decide, checkAddress: allowAddress, now: browser.now, dwellMs: 3000 });
    expect(result.segments.map((segment) => [segment.startSeconds, segment.endSeconds])).toEqual([
      [0, 3],
      [3.5, 6.5],
    ]);
    expect(result.durationMs).toBe(6500);
    expect(result.frames.some((frame) => frame.data.toString().startsWith('frame-while-waiting'))).toBe(false);
  });

  it('never offers or clicks a denied, in-form or off-site element, whatever the model answers', async () => {
    const browser = fakeBrowser();
    const decide = steps({ action: 'click', element: 2 }, { action: 'click', element: 5 }, { action: 'click', element: 3 }, { action: 'click', element: 4 }, { action: 'done' });
    const result = await runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: decide, checkAddress: allowAddress, now: browser.now, dwellMs: 1000 });
    expect(browser.clicks).toEqual([]);
    expect(result.segments).toHaveLength(4);
    const prompt = (decide.mock.calls[0] as unknown as [string, string])[1];
    expect(prompt).toContain('1. [link] Invoices');
    expect(prompt).not.toContain('Delete account');
    expect(prompt).not.toContain('Log out');
    expect(prompt).not.toContain('Partner site');
    expect(prompt).not.toContain('Apply');
    // Neither the password nor the username ever reaches the model.
    for (const call of decide.mock.calls as unknown as [string, string][]) {
      expect(call.join(' ')).not.toContain(PASSWORD);
      expect(call.join(' ')).not.toContain('trial@example.com');
    }
  });

  it('stops at the step and time caps', async () => {
    const browser = fakeBrowser();
    const forever = vi.fn(async () => ({ action: 'scroll' as const, element: null, title: 'More', description: 'More.' }));
    const capped = await runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: forever, checkAddress: allowAddress, now: browser.now, dwellMs: 1000, maxSteps: 3 });
    expect(capped.segments).toHaveLength(3);

    const second = fakeBrowser();
    const timed = await runDemoTour({ launchBrowser: second.launch, credentials, context, decideStep: forever, checkAddress: allowAddress, now: second.now, dwellMs: 4000, maxSeconds: 10 });
    expect(timed.segments.map((segment) => segment.endSeconds)).toEqual([4, 8]);
    expect(timed.durationMs).toBeLessThanOrEqual(10_000);
  });

  it('fails as login_failed when still on the sign-in page, and login_form_not_found without a form', async () => {
    await expect(runDemoTour({ launchBrowser: fakeBrowser({ loginWorks: false }).launch, credentials, context, decideStep: steps(), checkAddress: allowAddress, now: () => 0 })).rejects.toMatchObject({ code: 'login_failed' });
    await expect(runDemoTour({ launchBrowser: fakeBrowser({ form: false }).launch, credentials, context, decideStep: steps(), checkAddress: allowAddress, now: () => 0 })).rejects.toMatchObject({ code: 'login_form_not_found' });
    await expect(runDemoTour({ launchBrowser: fakeBrowser({ open: false }).launch, credentials, context, decideStep: steps(), checkAddress: allowAddress, now: () => 0 })).rejects.toMatchObject({ code: 'site_unreachable' });
  });

  it('refuses a login address that is not public before launching a browser', async () => {
    const browser = fakeBrowser();
    await expect(
      runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: steps(), checkAddress: async () => Promise.reject(new Error('private')), now: () => 0 }),
    ).rejects.toMatchObject({ code: 'site_unreachable' });
    expect(browser.launch).not.toHaveBeenCalled();
  });

  it('after sign-in, the browser rule keeps navigation on the site', async () => {
    const browser = fakeBrowser();
    await runDemoTour({ launchBrowser: browser.launch, credentials, context, decideStep: steps({ action: 'scroll' }), checkAddress: allowAddress, now: browser.now, dwellMs: 1000 });
    const allow = browser.options()!.allowRequest;
    expect(await allow({ url: 'https://app.example.com/x', method: 'GET', isNavigation: true })).toBe(true);
    expect(await allow({ url: 'https://elsewhere.com/', method: 'GET', isNavigation: true })).toBe(false);
    expect(await allow({ url: 'https://app.example.com/x', method: 'POST', isNavigation: true })).toBe(false);
  });

  it('a browser that cannot start is browser_unavailable', async () => {
    await expect(
      runDemoTour({ launchBrowser: async () => Promise.reject(new Error('no chromium')), credentials, context, decideStep: steps(), checkAddress: allowAddress, now: () => 0 }),
    ).rejects.toBeInstanceOf(DemoRecorderError);
  });
});

describe('clickableForTour', () => {
  it('keeps same-site links and in-page buttons only', () => {
    const allowed = clickableForTour({ url: 'https://app.example.com/home', title: '', headings: [], clickables: PAGES['https://app.example.com/home'].clickables }, new Set(['example.com']));
    expect(allowed.map((element) => element.name)).toEqual(['Invoices']);
  });
});

describe('encoding', () => {
  it('lists each frame until the next and the last until the end', () => {
    const list = buildFrameList(
      [
        { file: '/tmp/a.jpg', atMs: 120 },
        { file: '/tmp/b.jpg', atMs: 1000 },
      ],
      2500,
    );
    expect(list).toBe("ffconcat version 1.0\nfile '/tmp/a.jpg'\nduration 1.000\nfile '/tmp/b.jpg'\nduration 1.500\nfile '/tmp/b.jpg'\n");
  });

  it('encodes to constant-rate H.264 at 1280x800, silent, capped at 90 seconds', () => {
    const args = buildDemoEncodeArgs('/tmp/list.txt', '/tmp/out.mp4');
    expect(args).toEqual(expect.arrayContaining(['-f', 'concat', '-c:v', 'libx264', '-an', '-r', '30', '-t', '90']));
    expect(args.join(' ')).toContain('fps=30');
    expect(args.join(' ')).toContain('scale=1280:800');
  });
});

describe('chooseDemoSegments', () => {
  const segments = [
    { id: 'a', startSeconds: 0, endSeconds: 1, title: 'Menu', description: '' },
    { id: 'b', startSeconds: 1, endSeconds: 5, title: 'Invoices', description: '' },
    { id: 'c', startSeconds: 5, endSeconds: 9, title: 'Reports', description: '' },
  ];

  it('uses the model pick, ignoring unknown ids', async () => {
    const chosen = await chooseDemoSegments(segments, async () => ({ segmentIds: ['c', 'zzz'] }), context);
    expect(chosen.map((segment) => segment.selected)).toEqual([false, false, true]);
  });

  it('falls back to the first moments long enough to read', async () => {
    const chosen = await chooseDemoSegments(segments, async () => Promise.reject(new Error('down')), context);
    expect(chosen.map((segment) => segment.selected)).toEqual([false, true, true]);
  });
});

describe('redactSecrets', () => {
  it('removes every occurrence of each secret', () => {
    expect(redactSecrets(`failed for ${PASSWORD} and ${PASSWORD}`, [PASSWORD, ''])).toBe('failed for [redacted] and [redacted]');
  });
});

function llm(): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  const answers: unknown[] = [
    { action: 'scroll', element: null, title: 'Dashboard', description: 'The overview.' },
    { action: 'click', element: 1, title: 'Invoices', description: 'All invoices.' },
    { action: 'done', element: null, title: '', description: '' },
    { segmentIds: [] },
  ];
  return { provider: 'gemini', model: 'gemini-test', generateJson: vi.fn(async () => answers.shift()) } as never;
}

describe('recordProductWalkthrough', () => {
  const ctx = { organizationId: 'o', projectId: 'p', actorId: 'u' };
  const recording = { id: 'r1', organization_id: 'o', project_id: 'p' };

  beforeEach(() => {
    vi.clearAllMocks();
    orm.revealAdStudioDemoAccess.mockResolvedValue({ ...credentials, notes: 'Show invoices' });
    orm.listAdStudioDemoRecordings.mockResolvedValue([]);
    orm.listAdStudioBriefs.mockResolvedValue([{ product_description: 'Invoicing', language: 'he' }]);
    orm.createAdStudioDemoRecording.mockResolvedValue(recording);
    orm.markAdStudioDemoRecordingReady.mockImplementation(async (_rec, params) => ({ ...recording, status: 'ready', ...params }));
    orm.markAdStudioDemoRecordingFailed.mockImplementation(async (_rec, code) => ({ ...recording, status: 'failed', failure_code: code }));
  });

  function deps(browser = fakeBrowser()) {
    const storage = createMemoryMediaStorage();
    const runner = {
      ffmpegPath: 'ffmpeg',
      timeoutMs: 1000,
      spawnImpl: vi.fn((_command: string, args: string[]) => {
        const handlers: Record<string, (value: unknown) => void> = {};
        void import('node:fs/promises').then(async ({ writeFile }) => {
          await writeFile(args[args.length - 1], Buffer.from('mp4'));
          handlers.close?.(0);
        });
        return { stderr: { on: () => undefined }, on: (event: string, listener: (value: unknown) => void) => void (handlers[event] = listener), kill: () => undefined };
      }),
    };
    return { browser, storage, runner, value: { launchBrowser: browser.launch, llm: llm(), storage, runner, kms: { kind: 'kms' } as never, now: browser.now, checkAddress: allowAddress, dwellMs: 2000 } };
  }

  it('records, stores the video under the project, selects moments and meters each guide call as demo_tour', async () => {
    const setup = deps();
    const saved = await recordProductWalkthrough(ctx, setup.value);
    expect(saved).toMatchObject({ status: 'ready', gcsPath: 'orgs/o/projects/p/demo-recordings/r1.mp4' });
    expect(setup.storage.objects.get('orgs/o/projects/p/demo-recordings/r1.mp4')?.contentType).toBe('video/mp4');
    const params = orm.markAdStudioDemoRecordingReady.mock.calls[0][1] as { segments: { title: string; selected: boolean }[] };
    expect(params.segments.map((segment) => [segment.title, segment.selected])).toEqual([
      ['Dashboard', true],
      ['Invoices', true],
    ]);
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'demo_tour', outcome: 'succeeded' }));
    expect(orm.assertAdStudioQuota).toHaveBeenCalledWith(expect.objectContaining({ kind: 'demo_tour', units: 9 }));
    // The tour speaks the latest ad's language.
    expect(setup.browser.options()?.locale).toBe('he');
  });

  it('keeps a failed recording with its code, and never logs the password', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setup = deps(fakeBrowser({ loginWorks: false }));
    const saved = await recordProductWalkthrough(ctx, setup.value);
    expect(saved).toMatchObject({ status: 'failed', failure_code: 'login_failed' });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(PASSWORD);
    errors.mockRestore();
  });

  it('refuses without trial access, without a vault, without a model, or while one is recording', async () => {
    orm.revealAdStudioDemoAccess.mockResolvedValueOnce(null);
    await expect(recordProductWalkthrough(ctx, deps().value)).rejects.toMatchObject({ code: 'no_demo_access' });
    await expect(recordProductWalkthrough(ctx, { ...deps().value, kms: null })).rejects.toMatchObject({ code: 'vault_not_configured' });
    await expect(recordProductWalkthrough(ctx, { ...deps().value, llm: null })).rejects.toMatchObject({ code: 'not_configured' });
    const setup = deps();
    orm.listAdStudioDemoRecordings.mockResolvedValueOnce([{ status: 'recording', requested_on: new Date(setup.browser.now()).toISOString() }]);
    await expect(recordProductWalkthrough(ctx, setup.value)).rejects.toBeInstanceOf(AdStudioDemoRequestError);
    expect(orm.createAdStudioDemoRecording).not.toHaveBeenCalled();
  });
});

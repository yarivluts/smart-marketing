import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod/v4';
import {
  AD_STUDIO_DEMO_MAX_RECORDING_SECONDS,
  AD_STUDIO_DEMO_MAX_STEPS,
  AD_STUDIO_DEMO_MIN_INSERT_SECONDS,
  type AdStudioDemoFailureCode,
  type AdStudioDemoSegment,
} from '@growthos/shared';
import {
  AdStudioQuotaExceededError,
  assertAdStudioQuota,
  assertPublicHttpsUrl,
  createAdStudioDemoRecording,
  listAdStudioBriefs,
  listAdStudioDemoRecordings,
  markAdStudioDemoRecordingFailed,
  markAdStudioDemoRecordingReady,
  newDemoSegmentId,
  revealAdStudioDemoAccess,
  type AdStudioDemoRecordingModel,
  type KmsProvider,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { AdStudioProviderError, type AdStudioLlm } from './llm';
import { meteredCall } from './metering';
import { adStudioDemoObjectPath, type AdStudioMediaStorage } from './media-storage';
import { FfmpegFailedError, FfmpegUnavailableError, runFfmpeg, type FfmpegRunner } from './ffmpeg';
import { cachedAddressCheck, decideDemoRequest, isDeniedElement, isSameSite, siteOf, type DemoRequest } from './demo-policy';

/**
 * The product walkthrough recorder: logs into the customer's trial account with a headless
 * Chromium, takes a short AI-guided tour of the app, screen-records it and cuts it into labelled
 * moments that video ads can show. Runs inside one request (Cloud Run allows 10 minutes; a
 * recording is capped at 90 seconds of video).
 *
 * Safety does not depend on the model: the recorder never clicks anything whose words say it
 * deletes, pays, signs out, invites, sends, publishes or saves; never types or submits after signing
 * in; only navigates within the sign-in site (and the site the app landed on); and every request the
 * browser makes passes the public-address guard. Recording starts only after sign-in, so the login
 * screen (and what was typed in it) never appears in the video. The password lives in memory for
 * this run only and is never logged.
 */

export const DEMO_VIEWPORT = { width: 1280, height: 800 } as const;
/** How long each moment of the tour is shown, scrolling slowly. */
export const DEMO_DWELL_MS = 3_500;
const DEMO_SCROLL_PX = 420;
/** Frames kept per second from the screencast; the video is then made constant 30 fps. */
const DEMO_CAPTURE_FPS = 15;
const DEMO_OUTPUT_FPS = 30;
/** A recording still running after this died with its request. */
export const DEMO_RECORDING_TIMEOUT_MS = 10 * 60_000;
const MAX_ELEMENTS_FOR_MODEL = 40;
const MAX_SELECTED = 3;

/** One element the tour could click: its role and accessible name, and its link address if any. */
export interface DemoClickable {
  index: number;
  role: string;
  name: string;
  href: string | null;
  /** Inside a form or a submit button: never clicked. */
  inForm: boolean;
}

export interface DemoSnapshot {
  url: string;
  title: string;
  headings: string[];
  clickables: DemoClickable[];
}

/** The browser, as the recorder drives it. The Playwright implementation is `demo-browser.ts`; tests fake it. */
export interface DemoDriver {
  /** Opens a page; false when it did not load. */
  open(url: string): Promise<boolean>;
  url(): string;
  /** Fills the sign-in form (username, then password, two-step forms included) and submits it. */
  login(credentials: { username: string; password: string }): Promise<'submitted' | 'no_form'>;
  /** A visible password field - still on a sign-in page. */
  passwordFieldVisible(): Promise<boolean>;
  /** Blocks every form submission and keyboard entry on the page from now on. */
  lockForms(): Promise<void>;
  snapshot(): Promise<DemoSnapshot>;
  /** Clicks the element with this index from the last snapshot; false when it could not be clicked. */
  click(index: number): Promise<boolean>;
  /** Waits for the page to settle after a click (navigation, network idle), bounded. */
  settle(): Promise<void>;
  /** Scrolls smoothly by `pixels` over `durationMs`. */
  scroll(pixels: number, durationMs: number): Promise<void>;
  startCapture(onFrame: (jpeg: Buffer) => void): Promise<void>;
  stopCapture(): Promise<void>;
  close(): Promise<void>;
}

export interface DemoBrowserOptions {
  locale: string;
  viewport: { width: number; height: number };
  /** Decides every request the browser makes; a false aborts it. */
  allowRequest: (request: DemoRequest) => Promise<boolean>;
}

export type DemoBrowserLauncher = (options: DemoBrowserOptions) => Promise<DemoDriver>;

/** A recording that could not be made, with the code the page shows. */
export class DemoRecorderError extends Error {
  constructor(public readonly code: AdStudioDemoFailureCode) {
    super(`Walkthrough recording failed: ${code}`);
    this.name = 'DemoRecorderError';
  }
}

/** Why a recording cannot start, as a code the UI translates. */
export type AdStudioDemoRequestCode = 'no_demo_access' | 'already_recording' | 'vault_not_configured' | 'not_configured' | 'invalid_segments';

export class AdStudioDemoRequestError extends Error {
  constructor(public readonly code: AdStudioDemoRequestCode) {
    super(`Walkthrough request refused: ${code}`);
    this.name = 'AdStudioDemoRequestError';
  }
}

/** Replaces every secret in a message, so no log line can carry one. */
export function redactSecrets(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]');
  return out;
}

const TourStepSchema = z.object({
  action: z.enum(['click', 'scroll', 'done']).describe('click an element, scroll the current page, or done when the tour has shown enough'),
  element: z.number().int().nullable().describe('The number of the element to click; null unless action is click.'),
  title: z.string().describe('A short label (2-5 words) for the moment this step shows, in the ad language.'),
  description: z.string().describe('One sentence on what this moment shows a viewer, in the ad language.'),
});
type TourStep = z.infer<typeof TourStepSchema>;

const PickSchema = z.object({ segmentIds: z.array(z.string()).describe('The 2 or 3 moments that best show the product in action, best first.') });

export interface DemoTourContext {
  productDescription: string;
  notes: string;
  language: string;
}

function tourSystemPrompt(): string {
  return [
    'You guide a short screen-recorded tour of a web app for a video ad. You are logged into a trial account.',
    'Each turn you see the current page and a numbered list of elements you may click.',
    'Pick the one action that best shows the product doing something valuable: open a main feature, a dashboard, a report, a list of real data.',
    'Never aim to change anything: no settings, no account or billing pages, no deleting, sending, inviting, paying or signing out.',
    'Prefer a different area of the app each step. Answer "scroll" to show more of the current page, and "done" when the tour has shown the main features.',
    'Write the title and description in the requested language, plainly, as a viewer would understand them.',
  ].join(' ');
}

function tourUserPrompt(ctx: DemoTourContext, snapshot: DemoSnapshot, allowed: readonly DemoClickable[], shown: readonly string[], step: number): string {
  return [
    `Language for title and description: ${ctx.language}`,
    `What the product is: ${ctx.productDescription || 'not described'}`,
    ctx.notes ? `The customer's notes (what to show, what to avoid): ${ctx.notes}` : '',
    `Step ${step + 1} of at most ${AD_STUDIO_DEMO_MAX_STEPS}.`,
    shown.length ? `Already shown: ${shown.join('; ')}` : 'Nothing shown yet; this is the first screen after signing in.',
    `Page title: ${snapshot.title}`,
    snapshot.headings.length ? `Headings: ${snapshot.headings.slice(0, 12).join(' | ')}` : '',
    'Elements you may click:',
    ...allowed.map((element) => `${element.index}. [${element.role}] ${element.name}${element.href ? ` (${element.href})` : ''}`),
  ]
    .filter(Boolean)
    .join('\n');
}

/** The elements the model may see and the recorder may click: named, not in a form, not denied, links on an allowed site. */
export function clickableForTour(snapshot: DemoSnapshot, sites: ReadonlySet<string>): DemoClickable[] {
  return snapshot.clickables
    .filter((element) => element.name.trim().length > 0 && !element.inForm && !isDeniedElement(element))
    .filter((element) => {
      if (!element.href) return true;
      let target: string;
      try {
        target = new URL(element.href, snapshot.url).toString();
      } catch {
        return false;
      }
      if (/^javascript:/i.test(element.href.trim()) || element.href.trim().startsWith('#')) return true;
      return isSameSite(target, sites);
    })
    .slice(0, MAX_ELEMENTS_FOR_MODEL);
}

interface CapturedFrame {
  data: Buffer;
  /** Milliseconds since the recording started. */
  atMs: number;
}

/** The concat-demuxer list that shows each frame until the next one, so the video keeps real timing. */
export function buildFrameList(frames: readonly { file: string; atMs: number }[], endMs: number): string {
  const lines = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => {
    // The first frame covers the start of the recording too.
    const from = index === 0 ? 0 : frame.atMs;
    const until = index + 1 < frames.length ? frames[index + 1].atMs : endMs;
    lines.push(`file '${frame.file}'`, `duration ${(Math.max(until - from, 1) / 1000).toFixed(3)}`);
  });
  // The demuxer ignores the last entry's duration unless the file is listed once more.
  if (frames.length) lines.push(`file '${frames[frames.length - 1].file}'`);
  return `${lines.join('\n')}\n`;
}

/** Turns the frame list into a constant-frame-rate H.264 MP4 (frames are repeated to fill each gap). */
export function buildDemoEncodeArgs(listFile: string, output: string, maxSeconds: number = AD_STUDIO_DEMO_MAX_RECORDING_SECONDS): string[] {
  const { width, height } = DEMO_VIEWPORT;
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=${DEMO_OUTPUT_FPS},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(DEMO_OUTPUT_FPS),
    '-an',
    '-movflags',
    '+faststart',
    '-t',
    String(maxSeconds),
    output,
  ];
}

/** What a tour produced: the frames, the moments, and how long it ran. */
export interface DemoTourResult {
  frames: CapturedFrame[];
  segments: Omit<AdStudioDemoSegment, 'selected'>[];
  durationMs: number;
  site: string | null;
}

/**
 * Signs in, then records the guided tour. The browser is always closed. Throws
 * {@link DemoRecorderError} with a code when it cannot sign in or captures nothing.
 */
export async function runDemoTour(params: {
  launchBrowser: DemoBrowserLauncher;
  credentials: { loginUrl: string; username: string; password: string };
  context: DemoTourContext;
  /** One guide decision; the caller meters it. */
  decideStep: (system: string, user: string) => Promise<TourStep>;
  checkAddress: (url: string) => Promise<void>;
  now: () => number;
  dwellMs?: number;
  maxSeconds?: number;
  maxSteps?: number;
}): Promise<DemoTourResult> {
  const dwellMs = params.dwellMs ?? DEMO_DWELL_MS;
  const maxMs = (params.maxSeconds ?? AD_STUDIO_DEMO_MAX_RECORDING_SECONDS) * 1000;
  const maxSteps = params.maxSteps ?? AD_STUDIO_DEMO_MAX_STEPS;
  const loginSite = siteOf(params.credentials.loginUrl);
  const sites = new Set<string>(loginSite ? [loginSite] : []);
  const state = { loggedIn: false, sites };
  const addressAllowed = cachedAddressCheck(params.checkAddress);

  if (!(await addressAllowed(params.credentials.loginUrl))) throw new DemoRecorderError('site_unreachable');

  let driver: DemoDriver;
  try {
    driver = await params.launchBrowser({
      locale: params.context.language,
      viewport: { ...DEMO_VIEWPORT },
      allowRequest: async (request) => (await decideDemoRequest(request, state, addressAllowed)) === 'allow',
    });
  } catch (error) {
    if (error instanceof DemoRecorderError) throw error;
    throw new DemoRecorderError('browser_unavailable');
  }

  const frames: CapturedFrame[] = [];
  let pending: CapturedFrame | null = null;
  let startedAt = 0;
  let capturing = false;
  const minGapMs = 1000 / DEMO_CAPTURE_FPS;
  const elapsed = () => params.now() - startedAt;
  try {
    if (!(await driver.open(params.credentials.loginUrl))) throw new DemoRecorderError('site_unreachable');
    let outcome: 'submitted' | 'no_form';
    try {
      outcome = await driver.login({ username: params.credentials.username, password: params.credentials.password });
    } catch {
      // Whatever went wrong while typing, the error is never passed on: it could quote the form.
      throw new DemoRecorderError('login_form_not_found');
    }
    if (outcome === 'no_form') throw new DemoRecorderError('login_form_not_found');
    if (await driver.passwordFieldVisible()) throw new DemoRecorderError('login_failed');

    // Signed in: from here no form is submitted, and navigation stays on the app's sites.
    const landed = siteOf(driver.url());
    if (landed) sites.add(landed);
    state.loggedIn = true;
    await driver.lockForms();

    startedAt = params.now();
    capturing = true;
    await driver.startCapture((data) => {
      if (!capturing) return;
      const frame = { data, atMs: Math.max(0, elapsed()) };
      const last = frames[frames.length - 1];
      if (!last || frame.atMs - last.atMs >= minGapMs) {
        frames.push(frame);
        pending = null;
      } else {
        pending = frame;
      }
    });

    const segments: DemoTourResult['segments'] = [];
    const shown: string[] = [];
    for (let step = 0; step < maxSteps; step += 1) {
      if (elapsed() + dwellMs > maxMs) break;
      const snapshot = await driver.snapshot();
      const allowed = clickableForTour(snapshot, sites);
      let decision: TourStep;
      try {
        decision = await params.decideStep(tourSystemPrompt(), tourUserPrompt(params.context, snapshot, allowed, shown, step));
      } catch (error) {
        // A guide failure after some moments ends the tour with what it has; before any, it fails it.
        if (segments.length) break;
        throw error;
      }
      if (decision.action === 'done' && segments.length) break;
      if (decision.action === 'click') {
        const target = allowed.find((element) => element.index === decision.element);
        // The model's choice is re-checked here: an element it was not offered is never clicked.
        if (target && (await driver.click(target.index))) {
          await driver.settle();
          if (!isSameSite(driver.url(), sites)) break;
        }
      }
      if (elapsed() + dwellMs > maxMs) break;
      const start = elapsed();
      await driver.scroll(DEMO_SCROLL_PX, dwellMs);
      const end = Math.min(elapsed(), maxMs);
      const title = decision.title.trim().slice(0, 80) || snapshot.title.slice(0, 80);
      segments.push({ id: newDemoSegmentId(), startSeconds: Math.round(start / 10) / 100, endSeconds: Math.round(end / 10) / 100, title, description: decision.description.trim().slice(0, 240) });
      shown.push(title);
    }
    const durationMs = Math.min(elapsed(), maxMs);
    capturing = false;
    await driver.stopCapture().catch(() => undefined);
    const last = pending as CapturedFrame | null;
    if (last) frames.push(last);
    if (frames.length === 0 || segments.length === 0) throw new DemoRecorderError('nothing_recorded');
    return { frames, segments, durationMs, site: landed ?? loginSite };
  } finally {
    capturing = false;
    await driver.close().catch(() => undefined);
  }
}

/** Writes the frames to disk and encodes them; returns the MP4 bytes. */
export async function encodeDemoFrames(result: Pick<DemoTourResult, 'frames' | 'durationMs'>, runner: FfmpegRunner): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-demo-'));
  try {
    const listed: { file: string; atMs: number }[] = [];
    for (const [index, frame] of result.frames.entries()) {
      const file = `frame-${String(index).padStart(5, '0')}.jpg`;
      await writeFile(path.join(workDir, file), frame.data);
      listed.push({ file: path.join(workDir, file).replace(/\\/g, '/'), atMs: frame.atMs });
    }
    const listFile = path.join(workDir, 'frames.txt');
    await writeFile(listFile, buildFrameList(listed, result.durationMs));
    const output = path.join(workDir, 'walkthrough.mp4');
    const { code, stderr } = await runFfmpeg(buildDemoEncodeArgs(listFile, output), runner);
    if (code !== 0) throw new FfmpegFailedError(`ffmpeg exited with code ${code}.`, stderr.slice(-2000));
    return await readFile(output);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Which moments to use in ads: the model picks the 2-3 that best show the product's value; without
 * an answer, the first ones long enough to read.
 */
export async function chooseDemoSegments(
  segments: readonly Omit<AdStudioDemoSegment, 'selected'>[],
  pick: ((system: string, user: string) => Promise<{ segmentIds: string[] }>) | null,
  context: DemoTourContext,
): Promise<AdStudioDemoSegment[]> {
  const known = new Set(segments.map((segment) => segment.id));
  let chosen: string[] = [];
  if (pick) {
    try {
      const answer = await pick(
        'You choose which moments of a screen recording of a web app go into a short video ad. Pick the 2 or 3 moments that best show the product doing something valuable for its customers. Skip moments that only show menus, empty screens or settings.',
        [
          `What the product is: ${context.productDescription || 'not described'}`,
          context.notes ? `The customer's notes: ${context.notes}` : '',
          'Moments:',
          ...segments.map((segment) => `${segment.id}: ${segment.title} - ${segment.description} (${Math.round(segment.endSeconds - segment.startSeconds)}s)`),
        ]
          .filter(Boolean)
          .join('\n'),
      );
      chosen = [...new Set(answer.segmentIds.filter((id) => known.has(id)))].slice(0, MAX_SELECTED);
    } catch {
      chosen = [];
    }
  }
  if (chosen.length === 0) {
    chosen = segments
      .filter((segment) => segment.endSeconds - segment.startSeconds >= AD_STUDIO_DEMO_MIN_INSERT_SECONDS)
      .slice(0, MAX_SELECTED)
      .map((segment) => segment.id);
  }
  const selected = new Set(chosen);
  return segments.map((segment) => ({ ...segment, selected: selected.has(segment.id) }));
}

export interface DemoRecorderDeps {
  launchBrowser: DemoBrowserLauncher;
  llm: AdStudioLlm | null;
  storage: AdStudioMediaStorage;
  runner: FfmpegRunner;
  /** The vault; null when none is configured (the trial access cannot be opened). */
  kms: KmsProvider | null;
  /** Milliseconds; the tour's clock. */
  now?: () => number;
  /** The public-address guard; tests that serve a local app replace it. */
  checkAddress?: (url: string) => Promise<void>;
  dwellMs?: number;
}

function failureCode(error: unknown): AdStudioDemoFailureCode {
  if (error instanceof DemoRecorderError) return error.code;
  if (error instanceof AdStudioQuotaExceededError) return 'quota_exceeded';
  if (error instanceof AdStudioProviderError) return 'provider_failed';
  if (error instanceof FfmpegUnavailableError) return 'ffmpeg_unavailable';
  if (error instanceof FfmpegFailedError) return 'encode_failed';
  return 'unknown';
}

/**
 * Records a walkthrough of the project's product with its trial access and stores it with its
 * moments, the best 2-3 selected for ads. Refuses (without recording) when no trial access is set,
 * the vault is not configured, no AI model is configured, the daily AI limit cannot cover the tour,
 * or a recording is already running. A recording that starts and fails is kept as `failed` with a
 * code, and returned.
 */
export async function recordProductWalkthrough(
  ctx: { organizationId: string; projectId: string; actorId: string },
  deps: DemoRecorderDeps,
): Promise<AdStudioDemoRecordingModel> {
  await ensureOrm();
  if (!deps.kms) throw new AdStudioDemoRequestError('vault_not_configured');
  if (!deps.llm) throw new AdStudioDemoRequestError('not_configured');
  const llm = deps.llm;
  const access = await revealAdStudioDemoAccess(ctx.organizationId, ctx.projectId, deps.kms);
  if (!access) throw new AdStudioDemoRequestError('no_demo_access');
  const clock = deps.now ?? (() => Date.now());
  const nowDate = () => new Date(clock());
  const existing = await listAdStudioDemoRecordings(ctx.organizationId, ctx.projectId);
  if (existing.some((row) => row.status === 'recording' && clock() - new Date(row.requested_on).getTime() <= DEMO_RECORDING_TIMEOUT_MS)) {
    throw new AdStudioDemoRequestError('already_recording');
  }
  for (const stale of existing.filter((row) => row.status === 'recording')) await markAdStudioDemoRecordingFailed(stale, 'timed_out', nowDate());
  // The whole tour (each step and the final pick) must fit in today's AI limit before anything starts.
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'demo_tour', units: AD_STUDIO_DEMO_MAX_STEPS + 1, now: nowDate() });

  const briefs = await listAdStudioBriefs(ctx.organizationId, ctx.projectId);
  const latest = briefs[0];
  const context: DemoTourContext = {
    productDescription: latest?.product_description ?? '',
    notes: access.notes,
    language: latest?.language ?? 'en',
  };
  const recording = await createAdStudioDemoRecording({ organizationId: ctx.organizationId, projectId: ctx.projectId, site: siteHost(access.loginUrl), requestedBy: ctx.actorId, now: nowDate() });
  const call = { organizationId: ctx.organizationId, projectId: ctx.projectId, actorId: ctx.actorId, llm };
  try {
    const tour = await runDemoTour({
      launchBrowser: deps.launchBrowser,
      credentials: access,
      context,
      decideStep: (system, user) => meteredCall({ ...call, now: nowDate() }, 'demo_tour', null, () => llm.generateJson({ system, user, schema: TourStepSchema, effort: 'low' })),
      checkAddress: deps.checkAddress ?? (async (url) => void (await assertPublicHttpsUrl(url))),
      now: clock,
      dwellMs: deps.dwellMs,
    });
    const video = await encodeDemoFrames(tour, deps.runner);
    const segments = await chooseDemoSegments(
      tour.segments,
      (system, user) => meteredCall({ ...call, now: nowDate() }, 'demo_tour', null, () => llm.generateJson({ system, user, schema: PickSchema, effort: 'low' })),
      context,
    );
    const objectPath = adStudioDemoObjectPath({ organizationId: ctx.organizationId, projectId: ctx.projectId, recordingId: recording.id });
    try {
      await deps.storage.upload(objectPath, video, 'video/mp4');
    } catch {
      throw new DemoRecorderError('storage_error');
    }
    return await markAdStudioDemoRecordingReady(recording, { gcsPath: objectPath, durationSeconds: Math.round(tour.durationMs / 10) / 100, segments, now: nowDate() });
  } catch (error) {
    const code = failureCode(error);
    const message = redactSecrets(error instanceof Error ? error.message : String(error), [access.password, access.username]);
    console.error('[ad-studio] walkthrough recording failed', { recordingId: recording.id, code, error: message });
    return markAdStudioDemoRecordingFailed(recording, code, nowDate());
  }
}

function siteHost(loginUrl: string): string | null {
  try {
    return new URL(loginUrl).host;
  } catch {
    return null;
  }
}

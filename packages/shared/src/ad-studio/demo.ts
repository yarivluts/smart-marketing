/**
 * The product walkthrough: a customer gives GrowthOS a trial (demo) account for their web app, the
 * studio records a short screen-recorded tour of it, splits it into labelled moments, and video ads
 * show the chosen moments - the product in action. Shared shapes, limits and the pure planning of
 * which moments fit into an ad.
 */

export const AD_STUDIO_DEMO_LIMITS = { loginUrl: 500, username: 200, password: 200, notes: 1000 } as const;

/** Never longer than this, whatever the tour wants. */
export const AD_STUDIO_DEMO_MAX_RECORDING_SECONDS = 90;
/** Steps of the guided tour. */
export const AD_STUDIO_DEMO_MAX_STEPS = 8;
/** At most this many moments go into one ad, each at most this long. */
export const AD_STUDIO_DEMO_MAX_INSERTS = 2;
export const AD_STUDIO_DEMO_MAX_INSERT_SECONDS = 5;
/** A moment shorter than this is not worth showing. */
export const AD_STUDIO_DEMO_MIN_INSERT_SECONDS = 2;

/** The demo access as the browser sees it: never the password, only whether one is stored. */
export interface AdStudioDemoAccessView {
  loginUrl: string;
  /** The trial account's username or email; null when it cannot be shown (no rights, or unreadable). */
  username: string | null;
  hasPassword: boolean;
  /** What to show and what to avoid, in the customer's words. */
  notes: string;
  lastChangedOn: string | null;
}

/** What a person typed in the form; an empty password keeps the stored one. */
export interface AdStudioDemoAccessInput {
  loginUrl: string;
  username: string;
  password: string;
  notes: string;
}

export const AD_STUDIO_DEMO_RECORDING_STATUSES = ['recording', 'ready', 'failed'] as const;
export type AdStudioDemoRecordingStatus = (typeof AD_STUDIO_DEMO_RECORDING_STATUSES)[number];

/**
 * Why a recording failed, as a code the UI translates:
 * - `login_form_not_found` / `login_failed`: no login form on the page, or still on it after signing in.
 * - `site_unreachable`: the login page did not open (or its address is not public https).
 * - `browser_unavailable` / `ffmpeg_unavailable`: the server is missing Chromium or ffmpeg.
 * - `nothing_recorded`: the tour captured no picture.
 * - `provider_failed` / `quota_exceeded`: the AI guide failed or the daily AI limit was reached.
 * - `encode_failed` / `storage_error` / `timed_out` / `unknown`.
 */
export const AD_STUDIO_DEMO_FAILURE_CODES = [
  'login_form_not_found',
  'login_failed',
  'site_unreachable',
  'browser_unavailable',
  'ffmpeg_unavailable',
  'nothing_recorded',
  'provider_failed',
  'quota_exceeded',
  'encode_failed',
  'storage_error',
  'timed_out',
  'unknown',
] as const;
export type AdStudioDemoFailureCode = (typeof AD_STUDIO_DEMO_FAILURE_CODES)[number];

export interface AdStudioDemoSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  /** A short label for the moment, in the ad's language. */
  title: string;
  /** One sentence on what this moment shows. */
  description: string;
  /** Used in video ads. */
  selected: boolean;
}

export interface AdStudioDemoRecordingView {
  id: string;
  status: AdStudioDemoRecordingStatus;
  failureCode: string | null;
  durationSeconds: number | null;
  segments: AdStudioDemoSegment[];
  /** The host the tour ran on, for the page to name. */
  site: string | null;
  requestedOn: string;
  completedOn: string | null;
}

/** Demo access from untrusted input, trimmed; null for a malformed shape. */
export function parseAdStudioDemoAccessInput(raw: unknown): AdStudioDemoAccessInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' ? field.trim() : null);
  const loginUrl = text(value.loginUrl);
  const username = text(value.username);
  // A password is kept exactly as typed - spaces can be part of it.
  const password = typeof value.password === 'string' ? value.password : value.password === undefined || value.password === null ? '' : null;
  const notes = value.notes === undefined || value.notes === null ? '' : text(value.notes);
  if (loginUrl === null || username === null || password === null || notes === null) return null;
  return { loginUrl, username, password, notes };
}

/** The fields that break the limits (not the address check, which needs the network). */
export function demoAccessFieldIssues(input: AdStudioDemoAccessInput, hasStoredPassword: boolean): string[] {
  const issues: string[] = [];
  if (!input.loginUrl || input.loginUrl.length > AD_STUDIO_DEMO_LIMITS.loginUrl) issues.push('login_url');
  if (!input.username || input.username.length > AD_STUDIO_DEMO_LIMITS.username) issues.push('username');
  if ((!input.password && !hasStoredPassword) || input.password.length > AD_STUDIO_DEMO_LIMITS.password) issues.push('password');
  if (input.notes.length > AD_STUDIO_DEMO_LIMITS.notes) issues.push('notes');
  return issues;
}

/** One moment placed in an ad: which segment, where in the recording it starts and how long it runs. */
export interface AdStudioDemoInsert {
  segmentId: string;
  startSeconds: number;
  seconds: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Which selected moments fit into an ad whose scenes run `sceneSeconds` in all: at most
 * {@link AD_STUDIO_DEMO_MAX_INSERTS}, each trimmed to {@link AD_STUDIO_DEMO_MAX_INSERT_SECONDS}, and
 * shortened or dropped so the whole ad stays within `maxTotalSeconds`. A moment that would run less
 * than {@link AD_STUDIO_DEMO_MIN_INSERT_SECONDS} is left out. Selected order is kept.
 */
export function planDemoInserts(params: {
  segments: readonly Pick<AdStudioDemoSegment, 'id' | 'startSeconds' | 'endSeconds' | 'selected'>[];
  sceneSeconds: number;
  maxTotalSeconds: number;
  recordingSeconds?: number | null;
}): AdStudioDemoInsert[] {
  let budget = params.maxTotalSeconds - params.sceneSeconds;
  const inserts: AdStudioDemoInsert[] = [];
  for (const segment of params.segments) {
    if (!segment.selected) continue;
    if (inserts.length >= AD_STUDIO_DEMO_MAX_INSERTS) break;
    const end = params.recordingSeconds ? Math.min(segment.endSeconds, params.recordingSeconds) : segment.endSeconds;
    const available = end - segment.startSeconds;
    const seconds = round(Math.min(available, AD_STUDIO_DEMO_MAX_INSERT_SECONDS, budget));
    if (seconds < AD_STUDIO_DEMO_MIN_INSERT_SECONDS) continue;
    inserts.push({ segmentId: segment.id, startSeconds: round(segment.startSeconds), seconds });
    budget -= seconds;
  }
  return inserts;
}

import type { OnboardingStep } from '@growthos/firebase-orm-models';
import type { SetupEnvironmentHealth, SetupHealthReport, SetupRequirementId, SetupRequirementStatus } from '@growthos/shared';
import type { VizStatus } from '@/components/viz/palette';

/**
 * Pure shaping for the workspace pages (dashboard, org home, audit log, onboarding): every number
 * these pages chart is derived here from records the page already read, so the derivations are
 * unit-tested and no page invents a figure of its own.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` (UTC) for an ISO timestamp, or null if it does not parse. */
export function isoDay(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/**
 * One bucket per UTC day for the `days` days ending today (oldest first), each holding the sum of
 * `valueOf` over the items stamped that day. Items outside the window are ignored, so a sparse
 * history reads as the zeros it really is rather than as a shorter chart.
 */
export function dailyTotals<T>(items: readonly T[], dateOf: (item: T) => string, valueOf: (item: T) => number, days: number, now: number): { day: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    buckets.set(new Date(now - offset * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const item of items) {
    const day = isoDay(dateOf(item));
    if (day !== null && buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + valueOf(item));
    }
  }
  return [...buckets.entries()].map(([day, value]) => ({ day, value }));
}

/** Short `MM-DD` axis label for a `YYYY-MM-DD` day. */
export function shortDayLabel(day: string): string {
  return day.slice(5);
}

/** Counts of each distinct value, most frequent first (ties by first appearance), capped at `limit`. */
export function topCounts(values: readonly string[], limit = Number.POSITIVE_INFINITY): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Up to two initials for an avatar: "Ada Lovelace" -> "AL", "ada.lovelace@x.io" -> "AL", "ada@x.io" -> "A". */
export function initialsFor(nameOrEmail: string): string {
  const local = nameOrEmail.includes('@') ? nameOrEmail.slice(0, nameOrEmail.indexOf('@')) : nameOrEmail;
  const parts = local
    .split(/[\s._+-]+/)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? (parts[1][0] ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

/** A stable palette index for an id, so the same actor always gets the same avatar colour. */
export function stableIndex(id: string, modulo: number): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return modulo > 0 ? hash % modulo : 0;
}

// ---------------------------------------------------------------------------------------------
// Project health (dashboard)
// ---------------------------------------------------------------------------------------------

export interface HealthBatch {
  created_at: string;
  accepted_count: number;
  quarantined_count: number;
}

export interface ProjectHealthEnvironment {
  name: string;
  score: number;
  connectedCount: number;
  totalCount: number;
}

export interface ProjectHealthSnapshot {
  /** The headline environment's setup-health score (0-100), or null when no report could be read. */
  score: number | null;
  headlineEnvironment: string | null;
  connectedCount: number;
  totalCount: number;
  requirements: { id: SetupRequirementId; status: SetupRequirementStatus }[];
  environments: ProjectHealthEnvironment[];
  lastIngestAt: string | null;
  /** Whole minutes since the newest batch, or null if nothing was ever ingested. */
  minutesSinceIngest: number | null;
  acceptedCount: number;
  quarantinedCount: number;
  batchCount: number;
  /** Accepted records per day for the trailing window, oldest first. */
  dailyAccepted: number[];
  status: VizStatus;
}

const ENVIRONMENT_ORDER = ['prod', 'staging', 'dev'];

/**
 * The environment a project's headline score is read from: production once anything is connected
 * there (what the project's reports default to); before that, the environment that is furthest
 * along (a project still integrating against dev reads as its dev progress, not a flat 0%), ties
 * broken in prod/staging/dev order. Every environment's own score is still listed beside it.
 */
export function pickHeadlineEnvironment(report: SetupHealthReport | null): SetupEnvironmentHealth | null {
  if (!report || report.environments.length === 0) return null;
  const ranked = [...report.environments].sort((a, b) => rankEnvironment(a.environmentName) - rankEnvironment(b.environmentName));
  const prod = ranked.find((environment) => environment.environmentName === 'prod');
  if (prod && prod.connectedCount > 0) return prod;
  return ranked.reduce((best, environment) => (environment.score > best.score ? environment : best), ranked[0]);
}

function rankEnvironment(name: string): number {
  const index = ENVIRONMENT_ORDER.indexOf(name);
  return index === -1 ? ENVIRONMENT_ORDER.length : index;
}

/**
 * A project's status dot: red when anything is in quarantine or nothing has ever arrived after a
 * source was expected (score 0 with batches), amber when data is stale (> 24h) or setup is partial,
 * green when data is fresh and every core requirement is connected, grey when there is nothing yet.
 */
export function projectHealthStatus(input: { score: number | null; coreConnected: number; coreTotal: number; minutesSinceIngest: number | null; quarantinedCount: number }): VizStatus {
  if (input.minutesSinceIngest === null) return 'idle';
  if (input.quarantinedCount > 0 && input.score === 0) return 'error';
  const stale = input.minutesSinceIngest > 24 * 60;
  const coreComplete = input.coreTotal > 0 && input.coreConnected >= input.coreTotal;
  if (!stale && coreComplete && input.quarantinedCount === 0) return 'ok';
  return 'warn';
}

export function summarizeProjectHealth(report: SetupHealthReport | null, batches: readonly HealthBatch[], now: number, days = 14): ProjectHealthSnapshot {
  const headline = pickHeadlineEnvironment(report);
  const newest = batches.reduce<string | null>((latest, batch) => (latest === null || batch.created_at > latest ? batch.created_at : latest), null);
  const newestTime = newest === null ? Number.NaN : Date.parse(newest);
  const minutesSinceIngest = Number.isNaN(newestTime) ? null : Math.max(0, Math.floor((now - newestTime) / 60000));
  // Counts cover the same trailing window the sparkline does, so the card's numbers and its chart agree.
  const windowStart = now - days * DAY_MS;
  const inWindow = batches.filter((batch) => {
    const time = Date.parse(batch.created_at);
    return !Number.isNaN(time) && time > windowStart;
  });
  const acceptedCount = inWindow.reduce((sum, batch) => sum + batch.accepted_count, 0);
  const quarantinedCount = inWindow.reduce((sum, batch) => sum + batch.quarantined_count, 0);
  const environments = report
    ? [...report.environments]
        .sort((a, b) => rankEnvironment(a.environmentName) - rankEnvironment(b.environmentName))
        .map((environment) => ({ name: environment.environmentName, score: environment.score, connectedCount: environment.connectedCount, totalCount: environment.totalCount }))
    : [];
  return {
    score: headline ? headline.score : null,
    headlineEnvironment: headline ? headline.environmentName : null,
    connectedCount: headline?.connectedCount ?? 0,
    totalCount: headline?.totalCount ?? 0,
    requirements: headline ? headline.requirements.map((requirement) => ({ id: requirement.requirementId, status: requirement.status })) : [],
    environments,
    lastIngestAt: newest,
    minutesSinceIngest,
    acceptedCount,
    quarantinedCount,
    batchCount: inWindow.length,
    dailyAccepted: dailyTotals(batches, (batch) => batch.created_at, (batch) => batch.accepted_count, days, now).map((bucket) => bucket.value),
    status: projectHealthStatus({
      score: headline ? headline.score : null,
      coreConnected: headline?.coreConnectedCount ?? 0,
      coreTotal: headline?.coreTotalCount ?? 0,
      minutesSinceIngest,
      quarantinedCount,
    }),
  };
}

/** A compact "time since" split for translation: `{ unit, value }` in minutes, hours or days. */
export function timeAgoParts(minutes: number): { unit: 'minutes' | 'hours' | 'days'; value: number } {
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  if (minutes < 48 * 60) return { unit: 'hours', value: Math.floor(minutes / 60) };
  return { unit: 'days', value: Math.floor(minutes / (24 * 60)) };
}

// ---------------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------------

/** The kind of change an audit action records, which picks its timeline icon and colour. */
export type AuditActionCategory = 'create' | 'update' | 'delete' | 'access' | 'data' | 'run' | 'other';

const CATEGORY_BY_VERB: Record<string, AuditActionCategory> = {
  create: 'create',
  register: 'create',
  install: 'create',
  mint: 'create',
  issue: 'create',
  claim: 'create',
  start: 'create',
  push: 'create',
  request: 'create',
  propose: 'create',
  update: 'update',
  evolve: 'update',
  settings_update: 'update',
  config_update: 'update',
  set_unit: 'update',
  set_secret: 'update',
  set: 'update',
  enable: 'update',
  unarchive: 'update',
  reactivated: 'update',
  assign_owner: 'update',
  update_status: 'update',
  update_definition: 'update',
  write_tier_change: 'update',
  status_set: 'update',
  complete: 'update',
  delete: 'delete',
  archive: 'delete',
  revoke: 'delete',
  detach: 'delete',
  disable: 'delete',
  dismiss: 'delete',
  uninstall: 'delete',
  suspended: 'delete',
  purge_landed_data: 'delete',
  role_granted: 'access',
  role_updated: 'access',
  refresh_token_reuse_detected: 'access',
  replay: 'data',
  reexport: 'data',
  sweep: 'data',
  trigger: 'run',
  tool_call: 'run',
  check: 'run',
};

/** `board.create` -> `create`; `project.session_replay_template.set` -> `update`; unknown -> `other`. */
export function auditActionCategory(action: string): AuditActionCategory {
  const dot = action.indexOf('.');
  const verb = dot === -1 ? action : action.slice(action.lastIndexOf('.') + 1);
  const domain = dot === -1 ? '' : action.slice(0, dot);
  if (domain === 'membership' || domain === 'api_key' || domain === 'mcp_oauth_grant') {
    return CATEGORY_BY_VERB[verb] === 'delete' ? 'delete' : 'access';
  }
  return CATEGORY_BY_VERB[verb] ?? 'other';
}

/** The object an action touched, humanised for display: `resource_attachment.push` -> `resource attachment`. */
export function auditActionDomain(action: string): string {
  const dot = action.indexOf('.');
  return (dot === -1 ? action : action.slice(0, dot)).replace(/_/g, ' ');
}

/** Entries grouped by their UTC day, newest day first, keeping each day's entries in input order. */
export function groupByDay<T extends { createdAt: string }>(entries: readonly T[]): { day: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const day = isoDay(entry.createdAt) ?? entry.createdAt;
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([day, dayEntries]) => ({ day, entries: dayEntries }));
}

// ---------------------------------------------------------------------------------------------
// Onboarding journey
// ---------------------------------------------------------------------------------------------

export const ONBOARDING_JOURNEY = ['start', 'pack', 'sources', 'funnel', 'board', 'done'] as const;
export type OnboardingJourneyStep = (typeof ONBOARDING_JOURNEY)[number];
export type OnboardingJourneyState = 'done' | 'current' | 'upcoming';

/**
 * Where each wizard step stands given the stored step (`null` = the wizard was never started).
 * Everything before the stored step is done, the stored step is current, the rest are upcoming;
 * a finished wizard marks every step done.
 */
export function onboardingJourneyStates(step: OnboardingStep | null): Record<OnboardingJourneyStep, OnboardingJourneyState> {
  const currentIndex = step === null ? 0 : step === 'done' ? ONBOARDING_JOURNEY.length : ONBOARDING_JOURNEY.indexOf(step);
  return Object.fromEntries(
    ONBOARDING_JOURNEY.map((id, index) => [id, index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming']),
  ) as Record<OnboardingJourneyStep, OnboardingJourneyState>;
}

/** How many of the wizard's steps are complete, out of the steps after "start" (pack..done). */
export function onboardingProgress(step: OnboardingStep | null): { completed: number; total: number; percent: number } {
  const states = onboardingJourneyStates(step);
  const steps = ONBOARDING_JOURNEY.filter((id) => id !== 'start' && id !== 'done');
  const completed = steps.filter((id) => states[id] === 'done').length;
  return { completed, total: steps.length, percent: Math.round((completed / steps.length) * 100) };
}

export function journeyStateToVizStatus(state: OnboardingJourneyState): VizStatus {
  return state === 'done' ? 'ok' : state === 'current' ? 'warn' : 'idle';
}

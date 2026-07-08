import { ProjectModel } from '../models/project.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { TrackingAlertModel } from '../models/tracking-alert.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { activeSchemaNamesForKind, listSchemaDefinitionsForProject } from './schema-registry.service';
import { getMostRecentRawRecordForSchema, listRawRecordsForSchemaSince } from './pipeline.service';

/** KAN-36 AC: "dropping an event type to zero fires an alert within an hour." */
export const TRACKING_ALERT_SILENCE_THRESHOLD_MS = 60 * 60 * 1000;

/** Same load-bounding reasoning as `listRecentIngestBatchesForProject` — bounds query cost until a real aggregation store exists. */
export const DEFAULT_TRACKING_ALERT_LIST_LIMIT = 100;

/** The volume overview's lookback window for sparklines. */
export const DEFAULT_EVENT_VOLUME_WINDOW_DAYS = 7;

/** Caps one event's volume-window read — a busy event shouldn't make its own sparkline an unbounded-cost driver. */
const MAX_EVENT_VOLUME_RECORDS_PER_SCHEMA = 500;

const MANUAL_TRIGGER = 'manual' as const;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * A project's currently `active` tracking-alert episodes, newest-first by
 * when they were first detected.
 */
export async function listActiveTrackingAlertsForProject(
  organizationId: string,
  projectId: string,
): Promise<TrackingAlertModel[]> {
  return TrackingAlertModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('status', '==', 'active')
    .orderBy('detected_at', 'desc')
    .limit(DEFAULT_TRACKING_ALERT_LIST_LIMIT)
    .get();
}

/**
 * A project's tracking-alert history (active and resolved episodes), ordered
 * by most-recently-checked first.
 */
export async function listTrackingAlertsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_TRACKING_ALERT_LIST_LIMIT,
): Promise<TrackingAlertModel[]> {
  return TrackingAlertModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('last_checked_at', 'desc')
    .limit(limit)
    .get();
}

export interface EventVolumeDailyBucket {
  /** UTC calendar date, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export interface EventVolumeOverviewEntry {
  schemaName: string;
  /** Oldest day first, one bucket per day in the window (including empty days). */
  dailyCounts: EventVolumeDailyBucket[];
  /** The event's own most recent landed-record timestamp, or `null` if it has never landed a single record. */
  lastSeenAt: string | null;
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function startOfUtcDayMs(ms: number): number {
  const date = new Date(ms);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/** Exactly `windowDays` UTC calendar dates ending on today (inclusive), oldest first — the sparkline's fixed x-axis regardless of which days actually have data. */
function dailyBucketKeys(windowStartOfDayMs: number, windowDays: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    keys.push(utcDateKey(new Date(windowStartOfDayMs + i * 24 * 60 * 60 * 1000).toISOString()));
  }
  return keys;
}

async function computeEventVolumeEntry(
  organizationId: string,
  projectId: string,
  schemaName: string,
  nowMs: number,
  windowDays: number,
): Promise<EventVolumeOverviewEntry> {
  // A trailing `windowDays`-day window ending on today, e.g. windowDays=7 covers today and the 6 days before it.
  const windowStartOfDayMs = startOfUtcDayMs(nowMs) - (windowDays - 1) * 24 * 60 * 60 * 1000;
  const records = await listRawRecordsForSchemaSince(
    organizationId,
    projectId,
    'event',
    schemaName,
    new Date(windowStartOfDayMs).toISOString(),
    MAX_EVENT_VOLUME_RECORDS_PER_SCHEMA,
  );

  const countByDay = new Map<string, number>();
  for (const record of records) {
    const day = utcDateKey(record.landed_at);
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }
  const dailyCounts = dailyBucketKeys(windowStartOfDayMs, windowDays).map((date) => ({ date, count: countByDay.get(date) ?? 0 }));

  // `records` is newest-first (see listRawRecordsForSchemaSince) so its first element — not last — is the most recent.
  let lastSeenAt = records.length > 0 ? records[0].landed_at : null;
  if (lastSeenAt === null) {
    // Nothing landed within the window — check further back before concluding this event has never flowed at all.
    const mostRecentEver = await getMostRecentRawRecordForSchema(organizationId, projectId, 'event', schemaName);
    lastSeenAt = mostRecentEver?.landed_at ?? null;
  }

  return { schemaName, dailyCounts, lastSeenAt };
}

/**
 * Per-event volume sparklines for every active event schema in a project
 * (KAN-36's "per-event volume sparklines" half of the AC) — a daily-bucketed
 * count over the trailing window plus each event's own last-seen timestamp.
 * Purely a read: computed fresh on every call from bounded Firestore queries,
 * nothing persisted, the same "recompute view-side, don't store a rollup"
 * posture `computeIngestHealthSummary` (KAN-35) already uses.
 *
 * `precomputedSchemaDefs` lets a caller that already fetched
 * `listSchemaDefinitionsForProject` for the same render (e.g. the schema
 * registry page, which lists every schema family alongside this overview)
 * skip a redundant re-fetch of the same collection — the same
 * `precomputedQuota` pass-through pattern `checkProjectQueryQuota` (KAN-39)
 * already established for its own equivalent duplicate-fetch.
 */
export async function getEventVolumeOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { now?: number; windowDays?: number; precomputedSchemaDefs?: SchemaDefModel[] },
): Promise<EventVolumeOverviewEntry[]> {
  await requireProjectInOrg(organizationId, projectId);
  const now = options?.now ?? Date.now();
  const windowDays = options?.windowDays ?? DEFAULT_EVENT_VOLUME_WINDOW_DAYS;

  const schemaDefs = options?.precomputedSchemaDefs ?? (await listSchemaDefinitionsForProject(organizationId, projectId));
  const eventNames = activeSchemaNamesForKind(schemaDefs, 'event');

  return Promise.all(eventNames.map((schemaName) => computeEventVolumeEntry(organizationId, projectId, schemaName, now, windowDays)));
}

export type TrackingAlertCheckAction = 'fired' | 'still_active' | 'resolved' | 'healthy';

export interface TrackingAlertCheckOutcome {
  schemaName: string;
  action: TrackingAlertCheckAction;
  alert: TrackingAlertModel | null;
  lastSeenAt: string | null;
}

export interface TrackingAlertCheckResult {
  checkedAt: string;
  outcomes: TrackingAlertCheckOutcome[];
}

async function evaluateEventForAlert(
  organizationId: string,
  projectId: string,
  schemaName: string,
  nowMs: number,
  nowIso: string,
  existingAlert: TrackingAlertModel | undefined,
): Promise<TrackingAlertCheckOutcome> {
  const mostRecent = await getMostRecentRawRecordForSchema(organizationId, projectId, 'event', schemaName);
  if (!mostRecent) {
    // Registered but has never landed a single record — nothing has "broken" yet, so nothing to alert on.
    return { schemaName, action: 'healthy', alert: existingAlert ?? null, lastSeenAt: null };
  }

  const lastSeenAt = mostRecent.landed_at;
  const silentMs = nowMs - Date.parse(lastSeenAt);

  if (silentMs >= TRACKING_ALERT_SILENCE_THRESHOLD_MS) {
    if (existingAlert) {
      existingAlert.last_checked_at = nowIso;
      await existingAlert.save();
      return { schemaName, action: 'still_active', alert: existingAlert, lastSeenAt };
    }
    const alert = new TrackingAlertModel();
    alert.organization_id = organizationId;
    alert.project_id = projectId;
    alert.schema_name = schemaName;
    alert.status = 'active';
    alert.trigger = MANUAL_TRIGGER;
    alert.detected_at = nowIso;
    alert.last_seen_at = lastSeenAt;
    alert.last_checked_at = nowIso;
    alert.setPathParams({ organization_id: organizationId, project_id: projectId });
    await alert.save();
    return { schemaName, action: 'fired', alert, lastSeenAt };
  }

  if (existingAlert) {
    existingAlert.status = 'resolved';
    existingAlert.resolved_at = nowIso;
    existingAlert.last_checked_at = nowIso;
    await existingAlert.save();
    return { schemaName, action: 'resolved', alert: existingAlert, lastSeenAt };
  }

  return { schemaName, action: 'healthy', alert: null, lastSeenAt };
}

/** Best-effort audit entry for one check that changed at least one alert's state — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed. Skipped entirely when there's no human actor or nothing changed, the same "no synthetic system actor, no noise entry for a no-op check" posture `recordOrchestrationRunAudit` (KAN-38) already uses. */
async function recordTrackingAlertCheckAudit(
  organizationId: string,
  projectId: string,
  changed: readonly TrackingAlertCheckOutcome[],
  performedByUserId: string | undefined,
): Promise<void> {
  if (!performedByUserId || changed.length === 0) {
    return;
  }
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'tracking_alert.check',
      targetType: 'project',
      targetId: projectId,
      summary: `Checked event-volume tracking alerts -> ${changed.map((outcome) => `${outcome.schemaName}:${outcome.action}`).join(', ')}`,
      after: { changes: changed.map((outcome) => ({ schemaName: outcome.schemaName, action: outcome.action })) },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

export interface CheckTrackingAlertsParams {
  organizationId: string;
  projectId: string;
  /** The human who triggered this check, if any — recorded on the audit entry when present. Omit for a future non-human caller (a real scheduler, once KAN-18 exists). */
  triggeredByUserId?: string;
  /** Injectable clock for deterministic tests — defaults to `Date.now()`. */
  now?: number;
}

/**
 * Manually checks every active event schema's volume for a project "right
 * now" — KAN-36's buildable-today stand-in for a real hourly scheduled check
 * (deferred until KAN-18 provisions somewhere to run a real cron on, the
 * same posture `triggerOrchestrationRun`'s own doc comment already
 * documents for KAN-38's "scheduled runs" AC). For each active event schema:
 * an event silent for at least {@link TRACKING_ALERT_SILENCE_THRESHOLD_MS}
 * gets a `TrackingAlertModel` created (first time) or refreshed (still
 * silent); an event that's flowing again resolves its own open episode. An
 * event that's never landed a single record is left alone — there's nothing
 * to have "broken" yet.
 *
 * Not transactional, the same deliberately-deferred gap
 * `registerSchemaDefinition`'s own doc comment documents for its own
 * existence check: two concurrent checks for the same project can both read
 * "no active alert" for a schema before either writes, and both create their
 * own `active` episode for it. A duplicate stays independently updatable
 * (the newer of the two just never gets picked up by a later check's
 * `activeAlertByName` map, since a `Map` only keeps one entry per
 * `schema_name`) rather than silently vanishing, so it's a visible nuisance
 * (an orphaned, unresolvable alert row) rather than a lost signal — flagged
 * here as known and out of scope for the same "no raw Firestore SDK access
 * outside `firestore-connection.ts`" reason a transaction would require.
 */
export async function checkTrackingAlertsForProject(params: CheckTrackingAlertsParams): Promise<TrackingAlertCheckResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const nowMs = params.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const [schemaDefs, existingActiveAlerts] = await Promise.all([
    listSchemaDefinitionsForProject(params.organizationId, params.projectId),
    listActiveTrackingAlertsForProject(params.organizationId, params.projectId),
  ]);
  const eventNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const activeAlertByName = new Map(existingActiveAlerts.map((alert) => [alert.schema_name, alert]));

  const outcomes = await Promise.all(
    eventNames.map((schemaName) =>
      evaluateEventForAlert(params.organizationId, params.projectId, schemaName, nowMs, nowIso, activeAlertByName.get(schemaName)),
    ),
  );

  const changed = outcomes.filter((outcome) => outcome.action === 'fired' || outcome.action === 'resolved');
  await recordTrackingAlertCheckAudit(params.organizationId, params.projectId, changed, params.triggeredByUserId);

  return { checkedAt: nowIso, outcomes };
}

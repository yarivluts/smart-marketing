import {
  clusterFeedbackThemes,
  computeNpsBreakdown,
  SURVEY_RESPONSE_SCHEMA_FIELDS,
  SURVEY_RESPONSE_SCHEMA_KIND,
  SURVEY_RESPONSE_SCHEMA_NAME,
  type FeedbackThemeCluster,
  type NpsBreakdown,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { listRecentRecordsForSchemas } from './pipeline.service';

/** This story's own NPS metric pack/digest only reads `survey_type: 'nps'` responses — a future CSAT survey lands under the same schema with a different value, and gets its own digest rather than being folded into this one. */
const NPS_SURVEY_TYPE = 'nps';

/** Same load-bounding reasoning as `DEFAULT_EVENT_VOLUME_WINDOW_DAYS` (KAN-36) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_NPS_OVERVIEW_RECORD_LIMIT = 500;
/** The NPS overview's daily-trend lookback window, and the theme digest's default "this month" window. */
export const DEFAULT_NPS_OVERVIEW_WINDOW_DAYS = 30;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface EnsureSurveyResponseSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureSurveyResponseSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `survey_response` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-82 `survey_response` event schema (v1) for
 * a project, if it isn't already registered — the same "seed on demand"
 * posture `ensureTouchpointSchemaRegistered` (KAN-57) established. Without
 * this, every survey response the in-app SDK sends would quarantine with
 * `schema_not_registered` until a human hand-built the exact field list via
 * the Schema Registry's generic register form.
 */
export async function ensureSurveyResponseSchemaRegistered(
  params: EnsureSurveyResponseSchemaRegisteredParams,
): Promise<EnsureSurveyResponseSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(
    params.organizationId,
    params.projectId,
    SURVEY_RESPONSE_SCHEMA_KIND,
    SURVEY_RESPONSE_SCHEMA_NAME,
  );
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: SURVEY_RESPONSE_SCHEMA_KIND,
      name: SURVEY_RESPONSE_SCHEMA_NAME,
      fields: SURVEY_RESPONSE_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId: params.createdByUserId,
    });
    return { schemaDef, registered: true };
  } catch (err) {
    // `registerSchemaDefinition` isn't transactional (see its own doc comment) — a concurrent caller
    // can win the race between our existence check above and this call. Treat that the same as having
    // found it already registered, matching `ensureTouchpointSchemaRegistered`'s own posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(
        params.organizationId,
        params.projectId,
        SURVEY_RESPONSE_SCHEMA_KIND,
        SURVEY_RESPONSE_SCHEMA_NAME,
      );
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

interface ParsedSurveyResponse {
  readonly score: number;
  readonly comment: string | null;
  readonly landedAt: string;
}

/** Tolerantly parses one landed `survey_response` raw record. Returns `null` for a different survey_type, or one with no valid numeric score — the same "malformed data doesn't crash the read" posture the dbt `fact_survey_response` mart's own `growthos_try_cast` establishes at the warehouse layer. */
function parseNpsResponse(record: RawRecordModel): ParsedSurveyResponse | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;
  if (props.survey_type !== NPS_SURVEY_TYPE) return null;

  const rawScore = props.score;
  const score = typeof rawScore === 'number' ? rawScore : typeof rawScore === 'string' ? Number(rawScore) : NaN;
  if (!Number.isFinite(score)) return null;

  const comment = typeof props.comment === 'string' && props.comment.trim().length > 0 ? props.comment.trim() : null;
  return { score, comment, landedAt: record.landed_at };
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function startOfUtcDayMs(ms: number): number {
  const date = new Date(ms);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/** Exactly `windowDays` UTC calendar dates ending on today (inclusive), oldest first — same fixed x-axis convention `getEventVolumeOverviewForProject` (KAN-36) established for its own sparkline. */
function dailyBucketKeys(windowStartOfDayMs: number, windowDays: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    keys.push(utcDateKey(new Date(windowStartOfDayMs + i * 24 * 60 * 60 * 1000).toISOString()));
  }
  return keys;
}

export interface NpsDailyTrendPoint {
  /** UTC calendar date, `YYYY-MM-DD`. */
  date: string;
  breakdown: NpsBreakdown;
}

export interface NpsOverview {
  /** NPS breakdown over every response this call read (bounded by `limit`), regardless of window. */
  overall: NpsBreakdown;
  /** Oldest day first, one bucket per day in the trend window (including empty days). */
  dailyTrend: NpsDailyTrendPoint[];
}

/**
 * A project's NPS score, promoter/passive/detractor breakdown, and a daily
 * trend over the trailing window — computed fresh from bounded, landed
 * `survey_response` raw records, folded across every environment (same
 * "whole project" posture `listRecentBillingEventsForProject`, KAN-80,
 * established). Purely a read: nothing persisted, recomputed on every call,
 * same posture `getEventVolumeOverviewForProject` (KAN-36) already uses.
 */
export async function getNpsOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; now?: number; windowDays?: number },
): Promise<NpsOverview> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_NPS_OVERVIEW_RECORD_LIMIT;
  const windowDays = options?.windowDays ?? DEFAULT_NPS_OVERVIEW_WINDOW_DAYS;
  const now = options?.now ?? Date.now();

  const records = await listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: SURVEY_RESPONSE_SCHEMA_KIND,
    schemaNames: [SURVEY_RESPONSE_SCHEMA_NAME],
    limit,
  });
  const responses = records.map(parseNpsResponse).filter((r): r is ParsedSurveyResponse => r !== null);

  const overall = computeNpsBreakdown(responses.map((r) => r.score));

  const windowStartOfDayMs = startOfUtcDayMs(now) - (windowDays - 1) * 24 * 60 * 60 * 1000;
  const scoresByDay = new Map<string, number[]>();
  for (const response of responses) {
    if (Date.parse(response.landedAt) < windowStartOfDayMs) continue;
    const day = utcDateKey(response.landedAt);
    const scores = scoresByDay.get(day) ?? [];
    scores.push(response.score);
    scoresByDay.set(day, scores);
  }
  const dailyTrend = dailyBucketKeys(windowStartOfDayMs, windowDays).map((date) => ({
    date,
    breakdown: computeNpsBreakdown(scoresByDay.get(date) ?? []),
  }));

  return { overall, dailyTrend };
}

/**
 * The "top complaint this month" digest: every landed NPS response's free-
 * text comment within the trailing window, clustered by `clusterFeedbackThemes`
 * (KAN-82's deterministic stand-in for a real LLM theme-clustering call, same
 * posture KAN-55's `suggestFieldMappingRules` established).
 */
export async function getFeedbackThemeDigestForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; now?: number; windowDays?: number },
): Promise<FeedbackThemeCluster[]> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_NPS_OVERVIEW_RECORD_LIMIT;
  const windowDays = options?.windowDays ?? DEFAULT_NPS_OVERVIEW_WINDOW_DAYS;
  const now = options?.now ?? Date.now();
  const windowStartMs = startOfUtcDayMs(now) - (windowDays - 1) * 24 * 60 * 60 * 1000;

  const records = await listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: SURVEY_RESPONSE_SCHEMA_KIND,
    schemaNames: [SURVEY_RESPONSE_SCHEMA_NAME],
    limit,
  });
  const comments = records
    .map(parseNpsResponse)
    .filter((r): r is ParsedSurveyResponse => r !== null && r.comment !== null && Date.parse(r.landedAt) >= windowStartMs)
    .map((r) => r.comment as string);

  return clusterFeedbackThemes(comments);
}

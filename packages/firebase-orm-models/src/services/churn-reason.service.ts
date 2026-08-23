import {
  CHURN_REASON_SCHEMA_FIELDS,
  CHURN_REASON_SCHEMA_KIND,
  CHURN_REASON_SCHEMA_NAME,
  clusterChurnReasons,
  type ChurnReasonThemeCluster,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { listRecentRecordsForSchemas } from './pipeline.service';

/** Same load-bounding reasoning as `DEFAULT_NPS_OVERVIEW_RECORD_LIMIT` (KAN-82) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_CHURN_REASON_OVERVIEW_RECORD_LIMIT = 500;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface EnsureChurnReasonSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureChurnReasonSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `churn_reason` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-84 `churn_reason` event schema (v1) for a
 * project, if it isn't already registered — the same "seed on demand"
 * posture `ensureSurveyResponseSchemaRegistered` (KAN-82) and
 * `ensureTouchpointSchemaRegistered` (KAN-57) established. Without this,
 * every churn-reason capture the tracking SDK's `submitChurnReason` sends
 * would quarantine with `schema_not_registered` until a human hand-built
 * the exact field list via the Schema Registry's generic register form.
 */
export async function ensureChurnReasonSchemaRegistered(
  params: EnsureChurnReasonSchemaRegisteredParams,
): Promise<EnsureChurnReasonSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(
    params.organizationId,
    params.projectId,
    CHURN_REASON_SCHEMA_KIND,
    CHURN_REASON_SCHEMA_NAME,
  );
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: CHURN_REASON_SCHEMA_KIND,
      name: CHURN_REASON_SCHEMA_NAME,
      fields: CHURN_REASON_SCHEMA_FIELDS.map((field) => ({
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
    // found it already registered, matching `ensureSurveyResponseSchemaRegistered`'s own posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(
        params.organizationId,
        params.projectId,
        CHURN_REASON_SCHEMA_KIND,
        CHURN_REASON_SCHEMA_NAME,
      );
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

interface ParsedChurnReason {
  readonly category: string;
  readonly reasonText: string | null;
  readonly landedAt: string;
}

/**
 * Tolerantly parses one landed `churn_reason` raw record. A landed event's
 * declared fields live under `payload.properties` (the full ingest
 * envelope also carries `event_id`/`event`/`ts` alongside it) — reading
 * `payload[fieldName]` directly, as an earlier record-feed bug did before
 * being caught and fixed (see PROGRESS.md), would silently see every field
 * as `undefined`. Returns `null` for a record with no usable category —
 * the same "malformed data doesn't crash the read" posture
 * `parseNpsResponse` (KAN-82) establishes.
 */
function parseChurnReason(record: RawRecordModel): ParsedChurnReason | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const category = typeof props.category === 'string' && props.category.trim().length > 0 ? props.category.trim() : null;
  if (!category) return null;

  const reasonText = typeof props.reason_text === 'string' && props.reason_text.trim().length > 0 ? props.reason_text.trim() : null;
  return { category, reasonText, landedAt: record.landed_at };
}

/**
 * The bounded, landed `churn_reason` raw records both
 * `getChurnReasonCategoryBreakdownForProject` and
 * `getChurnReasonThemeDigestForProject` read — exported so a caller needing
 * both (the Churn Reasons admin page) can fetch once and pass the result to
 * each via `precomputedRecords`, same pass-through convention
 * `listSurveyResponseRecordsForProject` (KAN-82) established.
 */
export async function listChurnReasonRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_CHURN_REASON_OVERVIEW_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: CHURN_REASON_SCHEMA_KIND,
    schemaNames: [CHURN_REASON_SCHEMA_NAME],
    limit,
  });
}

export interface ChurnReasonCategoryBreakdownEntry {
  category: string;
  count: number;
}

export interface ChurnReasonOverview {
  totalReasons: number;
  /** Counts of the exact structured `category` value each landed reason carried, most common first — distinct from the AI-clustered `theme` breakdown below (an `other`-categorized reason keeps showing as `other` here even once the digest infers a more specific theme for it). */
  byCategory: ChurnReasonCategoryBreakdownEntry[];
}

/**
 * A project's raw structured-category breakdown across its bounded, landed
 * `churn_reason` records, folded across every environment — same "whole
 * project" posture `listRecentBillingEventsForProject` (KAN-80) established.
 * Purely a read: nothing persisted, recomputed on every call. The richer
 * "plan/channel/cohort" breakdown (plan `14 §Gap 10`) is a dbt mart
 * (`fact_churn_reason`) queried through the ordinary metrics/Boards
 * machinery instead of a bespoke report here — see that model's own doc
 * comment.
 */
export async function getChurnReasonCategoryBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<ChurnReasonOverview> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_CHURN_REASON_OVERVIEW_RECORD_LIMIT;

  const records = options?.precomputedRecords ?? (await listChurnReasonRecordsForProject(organizationId, projectId, limit));
  const reasons = records.map(parseChurnReason).filter((r): r is ParsedChurnReason => r !== null);

  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason.category, (counts.get(reason.category) ?? 0) + 1);
  }

  const byCategory = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return { totalReasons: reasons.length, byCategory };
}

/**
 * The "live taxonomy" digest: every landed churn reason clustered by
 * `clusterChurnReasons` (KAN-84's deterministic stand-in for a real LLM
 * theme-clustering call, same posture `getFeedbackThemeDigestForProject`/
 * KAN-82 established) — blending each reason's own structured `category`
 * with an AI-inferred theme for anything left `other`/unrecognized.
 */
export async function getChurnReasonThemeDigestForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<ChurnReasonThemeCluster[]> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_CHURN_REASON_OVERVIEW_RECORD_LIMIT;

  const records = options?.precomputedRecords ?? (await listChurnReasonRecordsForProject(organizationId, projectId, limit));
  const reasons = records.map(parseChurnReason).filter((r): r is ParsedChurnReason => r !== null);

  return clusterChurnReasons(
    reasons.map((reason) => ({
      category: reason.category,
      reasonText: reason.reasonText ?? undefined,
    })),
  );
}

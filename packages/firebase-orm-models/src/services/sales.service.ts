import {
  DEMO_EVENT_SCHEMA_FIELDS,
  DEMO_EVENT_SCHEMA_KIND,
  DEMO_EVENT_SCHEMA_NAME,
  type DemoEventStage,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { listRecentRecordsForSchemas } from './pipeline.service';

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface EnsureDemoEventSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureDemoEventSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `demo_event` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-92 `demo_event` event schema (v1) for a
 * project, if it isn't already registered — the same "seed on demand"
 * posture `ensureSupportTicketSchemaRegistered` (KAN-90) / `ensureSurveyResponseSchemaRegistered`
 * (KAN-82) establish. Without this, every demo lifecycle event a connector
 * (or admin action) sends would quarantine with `schema_not_registered`.
 */
export async function ensureDemoEventSchemaRegistered(
  params: EnsureDemoEventSchemaRegisteredParams,
): Promise<EnsureDemoEventSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(params.organizationId, params.projectId, DEMO_EVENT_SCHEMA_KIND, DEMO_EVENT_SCHEMA_NAME);
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: DEMO_EVENT_SCHEMA_KIND,
      name: DEMO_EVENT_SCHEMA_NAME,
      fields: DEMO_EVENT_SCHEMA_FIELDS.map((field) => ({
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
    // found it already registered, matching `ensureSupportTicketSchemaRegistered`'s own posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(params.organizationId, params.projectId, DEMO_EVENT_SCHEMA_KIND, DEMO_EVENT_SCHEMA_NAME);
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

/** Same load-bounding reasoning as `DEFAULT_SUPPORT_LEADERBOARD_RECORD_LIMIT` (KAN-90) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_DEMO_FUNNEL_RECORD_LIMIT = 500;

/**
 * The bounded, landed `demo_event` raw records `getDemoFunnelForProject`
 * reads — exported so a caller needing multiple views of the same data can
 * fetch once and pass the result via `precomputedRecords`, same
 * pass-through convention `listSupportTicketRecordsForProject` (KAN-90)
 * establishes. The generic `/record-feed` admin page (KAN-81) also
 * browses this same schema once it's registered — no dedicated feed
 * needed here (see the Demos page's own doc comment).
 */
export async function listDemoEventRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_DEMO_FUNNEL_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: DEMO_EVENT_SCHEMA_KIND,
    schemaNames: [DEMO_EVENT_SCHEMA_NAME],
    limit,
  });
}

interface ParsedDemoEvent {
  readonly demoId: string;
  readonly stage: DemoEventStage;
  readonly repOrgPersonId: string | null;
}

const RECOGNIZED_STAGES: readonly DemoEventStage[] = ['scheduled', 'held', 'no_show', 'canceled'];

/** Tolerantly parses one landed `demo_event` raw record. Returns `null` for a missing/unrecognized `demo_id`/`stage` — the same "malformed data doesn't crash the read" posture `parseSupportTicketEvent` (KAN-90) establishes. */
function parseDemoEvent(record: RawRecordModel): ParsedDemoEvent | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const demoId = typeof props.demo_id === 'string' && props.demo_id.length > 0 ? props.demo_id : null;
  if (demoId === null) return null;

  const stage = typeof props.stage === 'string' && (RECOGNIZED_STAGES as readonly string[]).includes(props.stage) ? (props.stage as DemoEventStage) : null;
  if (stage === null) return null;

  const repOrgPersonId = typeof props.rep_org_person_id === 'string' && props.rep_org_person_id.length > 0 ? props.rep_org_person_id : null;

  return { demoId, stage, repOrgPersonId };
}

export interface DemoFunnelRepRow {
  repOrgPersonId: string;
  demosHeld: number;
  demosNoShow: number;
  /** `demosHeld / (demosHeld + demosNoShow)`, or `null` when neither has happened yet for this rep. */
  showRate: number | null;
}

export interface DemoFunnelResult {
  /** Every distinct `demo_id` this read saw a `scheduled`-stage event for. */
  demosScheduled: number;
  /** Every distinct `demo_id` this read saw a `held`-stage event for. */
  demosHeld: number;
  /** Every distinct `demo_id` this read saw a `no_show`-stage event for. */
  demosNoShow: number;
  /** Project-wide `demosHeld / (demosHeld + demosNoShow)`, or `null` when neither has happened yet. */
  showRate: number | null;
  /** Sorted highest-`demosHeld`-first. Only reps with at least one `held`/`no_show` outcome appear. */
  rows: DemoFunnelRepRow[];
  /**
   * The record cap this funnel was computed under, when more landed
   * `demo_event` records exist than were read — `null` when the read saw all
   * of them.
   *
   * Every number above is derived from a bounded read of the most recent raw
   * events, and the field comments say so honestly ("every distinct `demo_id`
   * this read saw"). What was missing is any way for a *renderer* to know it,
   * so the page showed them as the project's totals (KAN-164).
   *
   * `showRate` is the one that matters most. The window is the most recent N
   * *events*, not demos, and one demo emits `scheduled` and then
   * `held`/`no_show` days later — so the window cuts across demo lifecycles at
   * both ends. Past the cap the ratio stops being the project's show rate and
   * becomes the show rate of an arbitrary recency slice of events, which is
   * not a quantity anyone asked for.
   *
   * Measured by over-fetching one record rather than inferred from
   * `length === cap`: that comparison cannot tell "exactly N exist" from "tens
   * of thousands exist", and those say very different things about the number
   * printed beside them.
   */
  sampledFrom: number | null;
}

function computeShowRate(held: number, noShow: number): number | null {
  const denominator = held + noShow;
  return denominator === 0 ? null : held / denominator;
}

/**
 * Aggregates already-fetched, landed `demo_event` raw records into a demo
 * funnel (scheduled/held/no-show/show-rate) plus a per-rep breakdown —
 * pure (no Firestore access), same "fetch once, aggregate in TypeScript, no
 * warehouse dependency" posture `aggregateSupportLeaderboard` (KAN-90) and
 * `getNpsOverviewForProject` (KAN-82) both establish, so this renders
 * correctly even before a dbt build has run against a live warehouse.
 * `canceled`-stage events are counted in neither the funnel totals nor the
 * per-rep rows — a canceled demo was never held and never a no-show, it's
 * simply removed from the pipeline, the same "not every stage feeds every
 * number" posture `SUPPORT_TICKET_SCHEMA_FIELDS`'s own `opened`/`resolved`
 * split establishes for its own unused-by-a-given-metric stage.
 */
export function aggregateDemoFunnel(records: readonly RawRecordModel[], sampledFrom: number | null = null): DemoFunnelResult {
  const parsed = records.map(parseDemoEvent).filter((event): event is ParsedDemoEvent => event !== null);

  const scheduledDemoIds = new Set<string>();
  const heldDemoIds = new Set<string>();
  const noShowDemoIds = new Set<string>();
  const byRep = new Map<string, { held: Set<string>; noShow: Set<string> }>();

  for (const event of parsed) {
    if (event.stage === 'scheduled') {
      scheduledDemoIds.add(event.demoId);
      continue;
    }
    if (event.stage === 'canceled') {
      continue;
    }

    if (event.stage === 'held') {
      heldDemoIds.add(event.demoId);
    } else {
      noShowDemoIds.add(event.demoId);
    }

    if (event.repOrgPersonId === null) continue;
    const bucket = byRep.get(event.repOrgPersonId) ?? { held: new Set<string>(), noShow: new Set<string>() };
    if (event.stage === 'held') {
      bucket.held.add(event.demoId);
    } else {
      bucket.noShow.add(event.demoId);
    }
    byRep.set(event.repOrgPersonId, bucket);
  }

  const rows: DemoFunnelRepRow[] = [...byRep.entries()]
    .map(([repOrgPersonId, bucket]) => ({
      repOrgPersonId,
      demosHeld: bucket.held.size,
      demosNoShow: bucket.noShow.size,
      showRate: computeShowRate(bucket.held.size, bucket.noShow.size),
    }))
    .sort((a, b) => b.demosHeld - a.demosHeld);

  return {
    demosScheduled: scheduledDemoIds.size,
    demosHeld: heldDemoIds.size,
    demosNoShow: noShowDemoIds.size,
    showRate: computeShowRate(heldDemoIds.size, noShowDemoIds.size),
    rows,
    sampledFrom,
  };
}

/**
 * Options for {@link getDemoFunnelForProject}.
 *
 * A caller supplying its own records must also state whether those records
 * were capped, because only it knows. Expressed as a union rather than an
 * optional field so the answer cannot be omitted: defaulting it to "complete"
 * would quietly assert the thing this whole change exists to stop asserting
 * (KAN-164).
 */
export type GetDemoFunnelOptions =
  | { limit?: number; precomputedRecords?: undefined; sampledFrom?: undefined }
  | { precomputedRecords: RawRecordModel[]; sampledFrom: number | null; limit?: undefined };

/**
 * Fetches a project's bounded, landed `demo_event` raw records and
 * aggregates them into the funnel (see {@link aggregateDemoFunnel}). The
 * one-call convenience wrapper — a caller that already has the records
 * (e.g. paired with another read over the same schema) should call the pure
 * aggregator directly instead, same posture `getSupportLeaderboardForProject`'s
 * own `precomputedRecords` option establishes.
 */
export async function getDemoFunnelForProject(
  organizationId: string,
  projectId: string,
  options?: GetDemoFunnelOptions,
): Promise<DemoFunnelResult> {
  await requireProjectInOrg(organizationId, projectId);

  if (options && 'precomputedRecords' in options && options.precomputedRecords !== undefined) {
    return aggregateDemoFunnel(options.precomputedRecords, options.sampledFrom);
  }

  // One record past the cap, then dropped: that extra row is evidence the cap
  // was hit, never an entry. `records.length === limit` would say the same
  // thing for a project with exactly `limit` events — which is complete — and
  // for one with fifty thousand, which is a sample (KAN-164).
  const limit = options?.limit ?? DEFAULT_DEMO_FUNNEL_RECORD_LIMIT;
  const fetched = await listDemoEventRecordsForProject(organizationId, projectId, limit + 1);
  return aggregateDemoFunnel(fetched.slice(0, limit), fetched.length > limit ? limit : null);
}

import {
  SUPPORT_TICKET_SCHEMA_FIELDS,
  SUPPORT_TICKET_SCHEMA_KIND,
  SUPPORT_TICKET_SCHEMA_NAME,
  type SupportTicketStage,
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

export interface EnsureSupportTicketSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureSupportTicketSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `support_ticket_event` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-90 `support_ticket_event` event schema (v1)
 * for a project, if it isn't already registered — the same "seed on demand"
 * posture `ensureSurveyResponseSchemaRegistered` (KAN-82) / `ensureExperimentSchemasRegistered`
 * (KAN-89) establish. Without this, every ticket lifecycle event a connector
 * (or admin action) sends would quarantine with `schema_not_registered`.
 */
export async function ensureSupportTicketSchemaRegistered(
  params: EnsureSupportTicketSchemaRegisteredParams,
): Promise<EnsureSupportTicketSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(params.organizationId, params.projectId, SUPPORT_TICKET_SCHEMA_KIND, SUPPORT_TICKET_SCHEMA_NAME);
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: SUPPORT_TICKET_SCHEMA_KIND,
      name: SUPPORT_TICKET_SCHEMA_NAME,
      fields: SUPPORT_TICKET_SCHEMA_FIELDS.map((field) => ({
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
      const nowActive = await getActiveSchemaDefinition(params.organizationId, params.projectId, SUPPORT_TICKET_SCHEMA_KIND, SUPPORT_TICKET_SCHEMA_NAME);
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

/** Same load-bounding reasoning as `DEFAULT_NPS_OVERVIEW_RECORD_LIMIT` (KAN-82) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_SUPPORT_LEADERBOARD_RECORD_LIMIT = 500;

/**
 * The bounded, landed `support_ticket_event` raw records `getSupportLeaderboardForProject`
 * reads — exported so a caller needing multiple views of the same data can fetch once and
 * pass the result via `precomputedRecords`, same pass-through convention `listSurveyResponseRecordsForProject`
 * (KAN-82) establishes.
 */
export async function listSupportTicketRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_SUPPORT_LEADERBOARD_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: SUPPORT_TICKET_SCHEMA_KIND,
    schemaNames: [SUPPORT_TICKET_SCHEMA_NAME],
    limit,
  });
}

interface ParsedSupportTicketEvent {
  readonly ticketId: string;
  readonly stage: SupportTicketStage;
  readonly agentOrgPersonId: string | null;
  readonly firstResponseSeconds: number | null;
  readonly resolutionSeconds: number | null;
  readonly csatScore: number | null;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

/** Tolerantly parses one landed `support_ticket_event` raw record. Returns `null` for a missing/unrecognized `ticket_id`/`stage` — the same "malformed data doesn't crash the read" posture `parseNpsResponse` (KAN-82) establishes. */
function parseSupportTicketEvent(record: RawRecordModel): ParsedSupportTicketEvent | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const ticketId = typeof props.ticket_id === 'string' && props.ticket_id.length > 0 ? props.ticket_id : null;
  if (ticketId === null) return null;

  const stage = props.stage === 'opened' || props.stage === 'resolved' ? props.stage : null;
  if (stage === null) return null;

  const agentOrgPersonId = typeof props.agent_org_person_id === 'string' && props.agent_org_person_id.length > 0 ? props.agent_org_person_id : null;

  return {
    ticketId,
    stage,
    agentOrgPersonId,
    firstResponseSeconds: toFiniteNumberOrNull(props.first_response_seconds),
    resolutionSeconds: toFiniteNumberOrNull(props.resolution_seconds),
    csatScore: toFiniteNumberOrNull(props.csat_score),
  };
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface SupportLeaderboardRow {
  agentOrgPersonId: string;
  ticketsResolved: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  avgCsatScore: number | null;
}

export interface SupportLeaderboardResult {
  /** Every distinct `ticket_id` this read saw an `opened`-stage event for, regardless of resolution. */
  ticketsOpened: number;
  /** `ticketsOpened` minus every distinct `ticket_id` this read saw a `resolved`-stage event for — tickets still outstanding. Never negative even if a `resolved` event landed without its own `opened` event ever landing (a connector backfill gap), same "don't let malformed/partial data produce a nonsensical negative" posture other derived counts in this codebase take. */
  openBacklog: number;
  /** Sorted highest-`ticketsResolved`-first. */
  rows: SupportLeaderboardRow[];
}

/**
 * Aggregates already-fetched, landed `support_ticket_event` raw records into
 * a per-agent leaderboard (Gap 6's "team leaderboard: tickets-closed,
 * first-response/resolution time, satisfaction" AC) plus a project-wide open
 * backlog count — pure (no Firestore access), same "fetch once, aggregate in
 * TypeScript, no warehouse dependency" posture `getNpsOverviewForProject`
 * (KAN-82) and `aggregateRepCollectionLeaderboard` (KAN-88) both establish,
 * so a leaderboard renders correctly even before a dbt build has run against
 * a live warehouse. Only `resolved`-stage events are attributed to an agent
 * — an `opened`-stage event's `agent_org_person_id` is typically still null
 * (unassigned backlog), see the schema's own doc comment.
 */
export function aggregateSupportLeaderboard(records: readonly RawRecordModel[]): SupportLeaderboardResult {
  const parsed = records.map(parseSupportTicketEvent).filter((event): event is ParsedSupportTicketEvent => event !== null);

  const openedTicketIds = new Set<string>();
  const resolvedTicketIds = new Set<string>();
  const byAgent = new Map<string, { firstResponse: number[]; resolution: number[]; csat: number[]; ticketIds: Set<string> }>();

  for (const event of parsed) {
    if (event.stage === 'opened') {
      openedTicketIds.add(event.ticketId);
      continue;
    }

    resolvedTicketIds.add(event.ticketId);
    if (event.agentOrgPersonId === null) continue;

    const bucket = byAgent.get(event.agentOrgPersonId) ?? { firstResponse: [], resolution: [], csat: [], ticketIds: new Set<string>() };
    bucket.ticketIds.add(event.ticketId);
    if (event.firstResponseSeconds !== null) bucket.firstResponse.push(event.firstResponseSeconds);
    if (event.resolutionSeconds !== null) bucket.resolution.push(event.resolutionSeconds);
    if (event.csatScore !== null) bucket.csat.push(event.csatScore);
    byAgent.set(event.agentOrgPersonId, bucket);
  }

  const rows: SupportLeaderboardRow[] = [...byAgent.entries()]
    .map(([agentOrgPersonId, bucket]) => ({
      agentOrgPersonId,
      ticketsResolved: bucket.ticketIds.size,
      avgFirstResponseSeconds: average(bucket.firstResponse),
      avgResolutionSeconds: average(bucket.resolution),
      avgCsatScore: average(bucket.csat),
    }))
    .sort((a, b) => b.ticketsResolved - a.ticketsResolved);

  return {
    ticketsOpened: openedTicketIds.size,
    openBacklog: Math.max(0, openedTicketIds.size - resolvedTicketIds.size),
    rows,
  };
}

/**
 * Fetches a project's bounded, landed `support_ticket_event` raw records and
 * aggregates them into the leaderboard (see {@link aggregateSupportLeaderboard}).
 * The one-call convenience wrapper — a caller that already has the records
 * (e.g. paired with another read over the same schema) should call the pure
 * aggregator directly instead, same posture `getNpsOverviewForProject`'s own
 * `precomputedRecords` option establishes.
 */
export async function getSupportLeaderboardForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<SupportLeaderboardResult> {
  await requireProjectInOrg(organizationId, projectId);
  const records = options?.precomputedRecords ?? (await listSupportTicketRecordsForProject(organizationId, projectId, options?.limit));
  return aggregateSupportLeaderboard(records);
}

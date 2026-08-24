import { isRepCollectionType, type RepCollectionType } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { RepCollectionEntryModel } from '../models/rep-collection-entry.model';
import { OrgPersonModel } from '../models/org-person.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { checkRecordEnvelope } from './ingest.service';
import { listRecentBillingEventsForProject } from './pipeline.service';
import { STRIPE_CHARGE_EVENT_NAME } from '../plugin-runtime/stripe/schemas';

export class InvalidRepCollectionEntryError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid rep collection entry: ${reasons.join('; ')}`);
    this.name = 'InvalidRepCollectionEntryError';
  }
}

export class RepCollectionEntryNotFoundError extends Error {
  constructor() {
    super('No rep collection entry with this id exists in this project.');
    this.name = 'RepCollectionEntryNotFoundError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** Same `.init` + org-match pattern `segment.service.ts`'s own `requireOrgPersonInOrg` uses for `SegmentModel.owner_person_id` — not shared across files, the same non-sharing convention every sibling service in this package already follows for this exact check. */
async function requireOrgPersonInOrg(organizationId: string, orgPersonId: string): Promise<void> {
  const person = await OrgPersonModel.init(orgPersonId, { organization_id: organizationId });
  if (!person || person.organization_id !== organizationId) {
    throw new InvalidRepCollectionEntryError([`Org person "${orgPersonId}" does not exist in this organization.`]);
  }
}

async function loadRepCollectionEntry(organizationId: string, projectId: string, entryId: string): Promise<RepCollectionEntryModel> {
  const entry = await RepCollectionEntryModel.init(entryId, { organization_id: organizationId, project_id: projectId });
  if (!entry || entry.organization_id !== organizationId || entry.project_id !== projectId) {
    throw new RepCollectionEntryNotFoundError();
  }
  return entry;
}

export interface CreateRepCollectionEntryParams {
  organizationId: string;
  projectId: string;
  /** `null` when not yet attributed to a rep — see `RepCollectionEntryModel.org_person_id`'s own doc comment. */
  orgPersonId: string | null;
  company: string;
  collectionType: string;
  planFrom?: string | null;
  planTo?: string | null;
  amount: number;
  occurredAt: string;
  note?: string | null;
  /** Set when this entry is confirming a `listBillingCollectionSignalsForProject` suggestion — see `RepCollectionEntryModel.source_raw_record_id`. */
  sourceRawRecordId?: string | null;
  createdByUserId: string;
}

/**
 * Logs one collection to the ledger (KAN-88, E20.x, plan `14 §Gap 13`):
 * validates the shape, confirms `orgPersonId` (when given) resolves to a real
 * `OrgPersonModel` in this org — the same "collect all reasons, don't fail
 * fast" convention `createSegment`/`createGoal` already establish.
 */
export async function createRepCollectionEntry(params: CreateRepCollectionEntryParams): Promise<RepCollectionEntryModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];
  const company = params.company.trim();
  if (company.length === 0) {
    reasons.push('A collection entry must have a non-empty company.');
  }
  if (!isRepCollectionType(params.collectionType)) {
    reasons.push(`Unknown collection type "${params.collectionType}".`);
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    reasons.push('amount must be a finite number > 0.');
  }
  const occurredAt = params.occurredAt.trim();
  if (occurredAt.length === 0 || Number.isNaN(Date.parse(occurredAt))) {
    reasons.push('occurredAt must be a valid date.');
  }
  if (reasons.length > 0) {
    throw new InvalidRepCollectionEntryError(reasons);
  }

  if (params.orgPersonId !== null) {
    await requireOrgPersonInOrg(params.organizationId, params.orgPersonId);
  }

  const now = new Date().toISOString();
  const entry = new RepCollectionEntryModel();
  entry.organization_id = params.organizationId;
  entry.project_id = params.projectId;
  entry.org_person_id = params.orgPersonId;
  entry.company = company;
  entry.collection_type = params.collectionType as RepCollectionType;
  entry.plan_from = params.planFrom?.trim() ? params.planFrom.trim() : undefined;
  entry.plan_to = params.planTo?.trim() ? params.planTo.trim() : undefined;
  entry.amount = params.amount;
  entry.occurred_at = occurredAt;
  entry.note = params.note?.trim() ? params.note.trim() : undefined;
  entry.source_raw_record_id = params.sourceRawRecordId ?? undefined;
  entry.created_by = params.createdByUserId;
  entry.created_at = now;
  entry.updated_by = params.createdByUserId;
  entry.updated_at = now;
  entry.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await entry.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'rep_collection_entry.create',
      targetType: 'rep_collection_entry',
      targetId: entry.id,
      summary: `Logged a ${entry.collection_type} collection of ${entry.amount} for "${entry.company}"`,
      after: { orgPersonId: entry.org_person_id, company: entry.company, amount: entry.amount, collectionType: entry.collection_type },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return entry;
}

export interface UpdateRepCollectionEntryParams {
  organizationId: string;
  projectId: string;
  entryId: string;
  /** `undefined` when the request didn't touch the rep at all — distinct from `null`, which explicitly unassigns it. Same convention `AssignSegmentOwnerParams` uses. */
  orgPersonId?: string | null;
  amount?: number;
  actorUserId: string;
}

/**
 * Reassigns the rep and/or corrects the amount on an existing ledger entry
 * (KAN-88) — the inline-edit commit path the ledger table's rep picker and
 * amount cell PATCH into. Company/type/plan/date/note are set once at
 * creation and not inline-editable — a wrong one should be deleted and
 * re-logged, the same "disposable saved config" posture `deleteSegment`
 * documents for its own sibling rather than a full edit form for every field.
 */
export async function updateRepCollectionEntry(params: UpdateRepCollectionEntryParams): Promise<RepCollectionEntryModel> {
  const entry = await loadRepCollectionEntry(params.organizationId, params.projectId, params.entryId);

  const reasons: string[] = [];
  if (params.amount !== undefined && (!Number.isFinite(params.amount) || params.amount <= 0)) {
    reasons.push('amount must be a finite number > 0.');
  }
  if (reasons.length > 0) {
    throw new InvalidRepCollectionEntryError(reasons);
  }
  if (params.orgPersonId !== undefined && params.orgPersonId !== null) {
    await requireOrgPersonInOrg(params.organizationId, params.orgPersonId);
  }

  const before = { orgPersonId: entry.org_person_id, amount: entry.amount };
  if (params.orgPersonId !== undefined) {
    entry.org_person_id = params.orgPersonId;
  }
  if (params.amount !== undefined) {
    entry.amount = params.amount;
  }
  entry.updated_by = params.actorUserId;
  entry.updated_at = new Date().toISOString();
  await entry.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'rep_collection_entry.update',
      targetType: 'rep_collection_entry',
      targetId: entry.id,
      summary: `Updated collection entry for "${entry.company}"`,
      before,
      after: { orgPersonId: entry.org_person_id, amount: entry.amount },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful update into a failure for the caller.
  }

  return entry;
}

/** Deletes a ledger entry outright — disposable saved data, the same posture `deleteSegment`/`deleteGoal` document for their own siblings. Still audit-logged (KAN-44 AC: "every config ... change"). */
export async function deleteRepCollectionEntry(organizationId: string, projectId: string, entryId: string, actorUserId: string): Promise<void> {
  const entry = await loadRepCollectionEntry(organizationId, projectId, entryId);
  await entry.delete();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: actorUserId,
      action: 'rep_collection_entry.delete',
      targetType: 'rep_collection_entry',
      targetId: entryId,
      summary: `Deleted collection entry for "${entry.company}"`,
    });
  } catch {
    // Best-effort — audit logging must never turn a successful delete into a failure for the caller.
  }
}

/** Every ledger entry in a project, newest-`occurred_at`-first (ties broken by `created_at`) — the chronological order a human browsing "who collected what, when" expects, unlike `listSegmentsForProject`'s creation-order (a segment has no inherent "when" of its own). */
export async function listRepCollectionEntriesForProject(organizationId: string, projectId: string): Promise<RepCollectionEntryModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const entries = await RepCollectionEntryModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at));
}

export type RepCollectionLeaderboardPeriod = 'week' | 'month';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The inclusive `[start, end]` date-only window for a leaderboard period, anchored to `now` — an ISO (Monday-start) week for `'week'`, a calendar month for `'month'`. */
function periodRange(period: RepCollectionLeaderboardPeriod, now: Date): { start: string; end: string } {
  if (period === 'week') {
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

export interface RepCollectionLeaderboardRow {
  orgPersonId: string;
  totalAmount: number;
  entryCount: number;
}

export interface RepCollectionLeaderboardResult {
  periodStart: string;
  periodEnd: string;
  /** Sorted highest-`totalAmount`-first — attributed reps only, see `unattributedTotal`/`unattributedCount` for the rest. */
  rows: RepCollectionLeaderboardRow[];
  unattributedTotal: number;
  unattributedCount: number;
}

export interface GetRepCollectionLeaderboardParams {
  organizationId: string;
  projectId: string;
  period: RepCollectionLeaderboardPeriod;
  /** Defaults to `new Date()` — overridable so tests get a deterministic window without mocking the clock globally. */
  now?: Date;
}

/**
 * Aggregates the ledger into a per-rep leaderboard for a fixed period
 * (KAN-88's "weekly/monthly collection per rep, leaderboard" AC): every
 * entry whose `occurred_at` falls in the period, summed by `org_person_id`,
 * highest total first. Reads the whole project's ledger and filters/sums in
 * memory — the same "buildable-today, no aggregation index" posture
 * `getCampaignSpendBreakdownForProject`'s own `sumByCampaign` establishes for
 * an admin page with no expectation of warehouse-scale volume yet.
 */
export async function getRepCollectionLeaderboardForProject(params: GetRepCollectionLeaderboardParams): Promise<RepCollectionLeaderboardResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const { start, end } = periodRange(params.period, params.now ?? new Date());
  const entries = await listRepCollectionEntriesForProject(params.organizationId, params.projectId);
  const inRange = entries.filter((entry) => {
    const occurredDate = entry.occurred_at.slice(0, 10);
    return occurredDate >= start && occurredDate <= end;
  });

  const totals = new Map<string, RepCollectionLeaderboardRow>();
  let unattributedTotal = 0;
  let unattributedCount = 0;
  for (const entry of inRange) {
    if (entry.org_person_id === null) {
      unattributedTotal += entry.amount;
      unattributedCount += 1;
      continue;
    }
    const bucket = totals.get(entry.org_person_id) ?? { orgPersonId: entry.org_person_id, totalAmount: 0, entryCount: 0 };
    bucket.totalAmount += entry.amount;
    bucket.entryCount += 1;
    totals.set(entry.org_person_id, bucket);
  }

  const rows = [...totals.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  return { periodStart: start, periodEnd: end, rows, unattributedTotal, unattributedCount };
}

export interface RepCollectionBillingSignal {
  rawRecordId: string;
  amount: number;
  currency: string;
  customerId: string;
  occurredAt: string;
}

/** How many of the project's most recent billing events `listBillingCollectionSignalsForProject` scans for un-linked charges — same bounded-candidate-window posture every Firestore-backed feed in this package already carries (see `listRecentBillingEventsForProject`'s own default). */
const MAX_BILLING_SIGNAL_CANDIDATES = 25;

/**
 * Surfaces recently landed, not-yet-attributed Stripe charges as ledger-entry
 * candidates (KAN-88's "auto from CRM/billing" AC half) — a human still picks
 * the rep and confirms via `createRepCollectionEntry` with `sourceRawRecordId`
 * set to one of these `rawRecordId`s, which is what actually excludes it from
 * future calls (not this function inferring intent on its own). Reads a
 * charge's `amount`/`currency`/`customer_id`/`status`/`refunded` from its
 * event `properties` via `checkRecordEnvelope` — not `payload.amount`
 * directly, which would read the wrong key (`RawRecordModel.payload` is the
 * whole ingest envelope, `event_id`/`event`/`ts` alongside `properties`; see
 * `checkRecordEnvelope`'s own doc comment and the KAN-81 fix that caught this
 * exact mistake in `record-feed-view.ts`). Only successful, non-refunded
 * charges are surfaced — a failed or refunded charge isn't a collection.
 */
export async function listBillingCollectionSignalsForProject(organizationId: string, projectId: string): Promise<RepCollectionBillingSignal[]> {
  await requireProjectInOrg(organizationId, projectId);
  const [records, entries] = await Promise.all([
    listRecentBillingEventsForProject(organizationId, projectId, MAX_BILLING_SIGNAL_CANDIDATES),
    listRepCollectionEntriesForProject(organizationId, projectId),
  ]);
  const linkedRawRecordIds = new Set(entries.map((entry) => entry.source_raw_record_id).filter((id): id is string => typeof id === 'string'));

  const signals: RepCollectionBillingSignal[] = [];
  for (const record of records) {
    if (record.schema_name !== STRIPE_CHARGE_EVENT_NAME || linkedRawRecordIds.has(record.id)) {
      continue;
    }
    const { fieldsToValidate: properties } = checkRecordEnvelope('event', record.payload);
    if (properties.status !== 'succeeded' || properties.refunded === true) {
      continue;
    }
    const amount = typeof properties.amount === 'number' ? properties.amount : Number(properties.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    signals.push({
      rawRecordId: record.id,
      amount,
      currency: typeof properties.currency === 'string' ? properties.currency : '',
      customerId: typeof properties.customer_id === 'string' ? properties.customer_id : '',
      occurredAt: record.landed_at,
    });
  }
  return signals;
}

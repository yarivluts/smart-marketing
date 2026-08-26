import { createHash } from 'node:crypto';
import { isRepCollectionType, type RepCollectionType } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { RepCollectionEntryModel } from '../models/rep-collection-entry.model';
import { OrgPersonModel } from '../models/org-person.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { checkRecordEnvelope } from './ingest.service';
import { listRecentRecordsForSchemas } from './pipeline.service';
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
  /**
   * Set when this entry is confirming a `listBillingCollectionSignalsForProject`
   * suggestion — see `RepCollectionEntryModel.source_raw_record_id`. When
   * set, `createRepCollectionEntry` upserts by {@link repCollectionEntryDocId}
   * rather than always minting a fresh document id, closing the "two callers
   * confirming the same signal concurrently both succeed, double-logging
   * that charge" race a prior doc comment here used to document as
   * deliberately deferred: a purely manual entry has no natural key to hash
   * (two different manual entries can legitimately share every visible
   * field), but a billing-signal confirmation always has one — the raw
   * record it's confirming — the same "content-hashed key so a caller-
   * supplied id is idempotent without a query first" posture
   * `campaignTargetDocId` (`campaign-target.service.ts`) already
   * establishes for its own arbitrary-string identifier.
   */
  sourceRawRecordId?: string | null;
  createdByUserId: string;
}

/**
 * Deterministic Firestore document id for a billing-signal-confirming ledger
 * entry, derived from the `RawRecordModel.id` it confirms — the same
 * "hash an arbitrary id into a safe, idempotent doc id" convention
 * `campaignTargetDocId` established, applied here so two racing
 * confirmations of the exact same signal collapse onto one document instead
 * of double-logging the charge (see {@link CreateRepCollectionEntryParams.sourceRawRecordId}).
 */
export function repCollectionEntryDocId(sourceRawRecordId: string): string {
  return createHash('sha256').update(sourceRawRecordId).digest('hex');
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
  // Every downstream reader (`listRepCollectionEntriesForProject`'s sort,
  // `aggregateRepCollectionLeaderboard`'s window filter) treats this as an
  // ISO date *prefix* (`slice(0, 10)`/lexical compare), not anything
  // `Date.parse` alone would accept ("08/24/2026" parses fine but sorts and
  // filters nowhere sensible) — so the shape check must match that, not just
  // parseability.
  const occurredAt = params.occurredAt.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    reasons.push('occurredAt must be an ISO date (YYYY-MM-DD) or date-time.');
  }
  if (reasons.length > 0) {
    throw new InvalidRepCollectionEntryError(reasons);
  }

  if (params.orgPersonId !== null) {
    await requireOrgPersonInOrg(params.organizationId, params.orgPersonId);
  }

  const sourceRawRecordId = params.sourceRawRecordId?.trim() ? params.sourceRawRecordId.trim() : undefined;
  // A billing-signal confirmation upserts by a deterministic doc id (two
  // racing confirmations of the same signal collapse onto one document); a
  // purely manual entry keeps today's fresh-random-id `save()` — it has no
  // natural key to hash, see `CreateRepCollectionEntryParams.sourceRawRecordId`'s
  // own doc comment.
  const docId = sourceRawRecordId !== undefined ? repCollectionEntryDocId(sourceRawRecordId) : undefined;
  const existing = docId !== undefined ? await RepCollectionEntryModel.init(docId, { organization_id: params.organizationId, project_id: params.projectId }) : null;

  const now = new Date().toISOString();
  const entry = existing ?? new RepCollectionEntryModel();
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
  entry.source_raw_record_id = sourceRawRecordId;
  if (!existing) {
    entry.created_by = params.createdByUserId;
    entry.created_at = now;
  }
  entry.updated_by = params.createdByUserId;
  entry.updated_at = now;
  entry.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await entry.save(docId);

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
 * Aggregates an already-fetched ledger into a per-rep leaderboard for a
 * fixed period (KAN-88's "weekly/monthly collection per rep, leaderboard"
 * AC): every entry whose `occurred_at` falls in the period, summed by
 * `org_person_id`, highest total first. Pure (no Firestore access) so a
 * caller that already has the ledger in hand — e.g. a page rendering both
 * the week and month leaderboard from one fetch — never re-reads the whole
 * collection per period, and so this is unit-testable without the emulator.
 */
export function aggregateRepCollectionLeaderboard(
  entries: readonly RepCollectionEntryModel[],
  period: RepCollectionLeaderboardPeriod,
  now: Date = new Date(),
): RepCollectionLeaderboardResult {
  const { start, end } = periodRange(period, now);
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

/**
 * Fetches a project's ledger and aggregates it into one period's leaderboard
 * (see {@link aggregateRepCollectionLeaderboard} for the aggregation itself)
 * — the one-call convenience wrapper for a caller that only needs a single
 * period (e.g. the win-rules war-room widget's own "this week" read). A
 * caller needing more than one period (the rep-collections page's own week
 * *and* month sections) should fetch the ledger once via
 * `listRepCollectionEntriesForProject` and call the pure aggregator directly
 * instead of calling this once per period.
 */
export async function getRepCollectionLeaderboardForProject(params: GetRepCollectionLeaderboardParams): Promise<RepCollectionLeaderboardResult> {
  const entries = await listRepCollectionEntriesForProject(params.organizationId, params.projectId);
  return aggregateRepCollectionLeaderboard(entries, params.period, params.now ?? new Date());
}

export interface RepCollectionBillingSignal {
  rawRecordId: string;
  amount: number;
  currency: string;
  customerId: string;
  occurredAt: string;
}

/**
 * How many of the project's most recent `stripe_charge` events
 * `listBillingCollectionSignalsForProject` scans for un-linked charges — the
 * same "over-fetch a candidate window, then filter" posture
 * `RECORD_FIELD_FILTER_CANDIDATE_WINDOW` (`pipeline.service.ts`) documents:
 * once a project's most-recent charges are all attributed, a narrower window
 * would starve the suggestion panel permanently rather than surfacing older
 * still-unattributed ones.
 */
const BILLING_SIGNAL_CANDIDATE_WINDOW = 200;

/**
 * Converts a Stripe charge amount from the API's smallest-currency-unit
 * convention (e.g. cents for USD) to a decimal amount matching how this
 * ledger's manually-typed amounts are entered (whole currency units) —
 * without this, a confirmed billing signal and a hand-typed entry differ by
 * a factor of 100 and the leaderboard silently sums incompatible numbers.
 * Known, documented limitation: does not special-case zero-decimal
 * currencies (e.g. JPY, KRW) — this codebase has no currency-formatting
 * convention yet to build a correct per-currency table against (see
 * `billing-ops-view.ts`'s own doc comment on the same gap for the billing-ops
 * feed, which shows raw minor units instead).
 */
function stripeMinorUnitsToDecimal(amountMinorUnits: number): number {
  return amountMinorUnits / 100;
}

export interface ListBillingCollectionSignalsOptions {
  /** Pass an already-fetched ledger (e.g. from a page that also needs it for the leaderboard) to skip this function's own `listRepCollectionEntriesForProject` read. */
  existingEntries?: readonly RepCollectionEntryModel[];
}

/**
 * Surfaces recently landed, not-yet-attributed Stripe charges as ledger-entry
 * candidates (KAN-88's "auto from CRM/billing" AC half) — a human still picks
 * the rep and confirms via `createRepCollectionEntry` with `sourceRawRecordId`
 * set to one of these `rawRecordId`s, which is what actually excludes it from
 * future calls (not this function inferring intent on its own). Reads a
 * charge's `amount`/`currency`/`customer_id`/`status`/`refunded`/
 * `amount_refunded` from its event `properties` via `checkRecordEnvelope` —
 * not `payload.amount` directly, which would read the wrong key
 * (`RawRecordModel.payload` is the whole ingest envelope, `event_id`/
 * `event`/`ts` alongside `properties`; see `checkRecordEnvelope`'s own doc
 * comment). Fetches only `stripe_charge` events via `listRecentRecordsForSchemas`
 * (not the 3-schema `listRecentBillingEventsForProject` billing-ops feed,
 * whose merged-then-sliced result would starve this function of charge
 * candidates whenever failed payments/refunds crowd the shared window).
 * Only successful, non-refunded (fully *or partially*) charges are
 * surfaced — a partial refund isn't a clean collection either.
 * `occurredAt` prefers the charge's own envelope `ts` over `landed_at`
 * (when a raw charge is landed by a backfill or a catch-up after an outage,
 * `landed_at` is today even though the charge happened earlier).
 */
export async function listBillingCollectionSignalsForProject(
  organizationId: string,
  projectId: string,
  options?: ListBillingCollectionSignalsOptions,
): Promise<RepCollectionBillingSignal[]> {
  const [records, entries] = await Promise.all([
    listRecentRecordsForSchemas({
      organizationId,
      projectId,
      kind: 'event',
      schemaNames: [STRIPE_CHARGE_EVENT_NAME],
      limit: BILLING_SIGNAL_CANDIDATE_WINDOW,
    }),
    options?.existingEntries ? Promise.resolve(options.existingEntries) : listRepCollectionEntriesForProject(organizationId, projectId),
  ]);
  const linkedRawRecordIds = new Set(entries.map((entry) => entry.source_raw_record_id).filter((id): id is string => typeof id === 'string'));

  const signals: RepCollectionBillingSignal[] = [];
  for (const record of records) {
    if (linkedRawRecordIds.has(record.id)) {
      continue;
    }
    const { fieldsToValidate: properties } = checkRecordEnvelope('event', record.payload);
    const amountRefunded = typeof properties.amount_refunded === 'number' ? properties.amount_refunded : Number(properties.amount_refunded ?? 0);
    const isPartiallyRefunded = Number.isFinite(amountRefunded) && amountRefunded > 0;
    if (properties.status !== 'succeeded' || properties.refunded === true || isPartiallyRefunded) {
      continue;
    }
    const amountMinorUnits = typeof properties.amount === 'number' ? properties.amount : Number(properties.amount);
    if (!Number.isFinite(amountMinorUnits) || amountMinorUnits <= 0) {
      continue;
    }
    const envelopeTs = record.payload.ts;
    signals.push({
      rawRecordId: record.id,
      amount: stripeMinorUnitsToDecimal(amountMinorUnits),
      currency: typeof properties.currency === 'string' ? properties.currency : '',
      customerId: typeof properties.customer_id === 'string' ? properties.customer_id : '',
      occurredAt: typeof envelopeTs === 'string' && envelopeTs.trim().length > 0 ? envelopeTs : record.landed_at,
    });
  }
  return signals;
}

import { createHash } from 'node:crypto';
import { COLLECTION_ACTIVITY_TYPES, isCollectionActivityType, MetricCompilerError, type CollectionActivityType } from '@growthos/shared';
import { CustomerOwnerModel } from '../models/customer-owner.model';
import { CollectionActivityModel } from '../models/collection-activity.model';
import { OrgPersonModel } from '../models/org-person.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import type { MetricQueryResultCache } from '../warehouse/result-cache';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';

/** `collected_revenue_by_customer`'s own name in the Rep Collections pack (`plugin-runtime/rep-collections-pack/metrics.ts`) — the one metric this codebase carries a `customer_id` dimension on today, mirroring `CAMPAIGN_SPEND_METRIC_NAME`'s own doc comment on why a new metric, not an evolution of the SaaS pack's own `collected_revenue`. */
export const REP_COLLECTIONS_METRIC_NAME = 'collected_revenue_by_customer';

export class InvalidRepCollectionError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid rep collection input: ${reasons.join('; ')}`);
    this.name = 'InvalidRepCollectionError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** Confirms `ownerPersonId` resolves to an `OrgPersonModel` belonging to `organizationId` — the same `.init` + org-match pattern `segment.service.ts`'s own `requireOrgPersonInOrg` uses. */
async function requireOrgPersonInOrg(organizationId: string, personId: string): Promise<void> {
  const person = await OrgPersonModel.init(personId, { organization_id: organizationId });
  if (!person || person.organization_id !== organizationId) {
    throw new InvalidRepCollectionError([`Person "${personId}" does not exist in this organization.`]);
  }
}

/**
 * The single normalization every customer id passes through — on write, on
 * lookup, and when bucketing a warehouse row. Applying it in exactly one
 * place is what keeps a stored assignment and a later query agreeing: a
 * warehouse `customer_id` carrying stray whitespace would otherwise hash to
 * a different {@link customerOwnerDocId} than the trimmed id an assignment
 * was saved under, silently splitting one customer into two rows (one
 * holding the revenue but unassignable, one holding the owner but showing
 * nothing collected).
 */
export function normalizeCustomerId(customerId: string): string {
  return customerId.trim();
}

/**
 * Deterministic Firestore document id for a customer's rep assignment,
 * derived from the {@link normalizeCustomerId}-normalized `customer_id`
 * rather than using it verbatim — the same reasoning `campaignTargetDocId`
 * documents for `CampaignTargetModel`.
 */
export function customerOwnerDocId(customerId: string): string {
  return createHash('sha256').update(normalizeCustomerId(customerId)).digest('hex');
}

export interface AssignCustomerOwnerParams {
  organizationId: string;
  projectId: string;
  customerId: string;
  ownerPersonId: string;
  actorUserId: string;
}

/**
 * Assigns (or reassigns) a customer's collections owner — one owner per
 * (project, customer_id), upserted by the deterministic doc id
 * {@link customerOwnerDocId} computes, the same "content-hashed key so a
 * caller-supplied id is idempotent without a query first" posture
 * `setCampaignTargetBudget` establishes.
 */
export async function assignCustomerOwner(params: AssignCustomerOwnerParams): Promise<CustomerOwnerModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const customerId = normalizeCustomerId(params.customerId);
  if (customerId.length === 0) {
    throw new InvalidRepCollectionError(['customerId must be a non-empty string.']);
  }
  await requireOrgPersonInOrg(params.organizationId, params.ownerPersonId);

  const docId = customerOwnerDocId(customerId);
  const now = new Date().toISOString();
  const existing = await CustomerOwnerModel.init(docId, { organization_id: params.organizationId, project_id: params.projectId });
  const previousOwnerPersonId = existing?.owner_person_id ?? null;

  const owner = existing ?? new CustomerOwnerModel();
  owner.organization_id = params.organizationId;
  owner.project_id = params.projectId;
  owner.customer_id = customerId;
  owner.owner_person_id = params.ownerPersonId;
  owner.assigned_by = params.actorUserId;
  owner.assigned_at = now;
  owner.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await owner.save(docId);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'rep_collections.assign_owner',
      targetType: 'customer_owner',
      targetId: customerId,
      summary: `Assigned customer "${customerId}" owner to ${params.ownerPersonId}`,
      before: { ownerPersonId: previousOwnerPersonId },
      after: { ownerPersonId: params.ownerPersonId },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful update into a failure for the caller.
  }

  return owner;
}

/** Clears a customer's collections owner — reverts to "unassigned" (dropped from the leaderboard's per-rep buckets into its "unassigned" total) rather than leaving a stale assignment. A no-op if none was set. */
export async function unassignCustomerOwner(organizationId: string, projectId: string, customerId: string, actorUserId: string): Promise<void> {
  await requireProjectInOrg(organizationId, projectId);
  const trimmedCustomerId = normalizeCustomerId(customerId);
  const docId = customerOwnerDocId(trimmedCustomerId);
  const existing = await CustomerOwnerModel.init(docId, { organization_id: organizationId, project_id: projectId });
  if (!existing) {
    return;
  }
  const previousOwnerPersonId = existing.owner_person_id;
  await existing.delete();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: actorUserId,
      action: 'rep_collections.unassign_owner',
      targetType: 'customer_owner',
      targetId: trimmedCustomerId,
      summary: `Unassigned customer "${trimmedCustomerId}" owner`,
      before: { ownerPersonId: previousOwnerPersonId },
      after: { ownerPersonId: null },
    });
  } catch {
    // Best-effort.
  }
}

export async function listCustomerOwnersForProject(organizationId: string, projectId: string): Promise<CustomerOwnerModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return CustomerOwnerModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

export interface RecordCollectionActivityParams {
  organizationId: string;
  projectId: string;
  customerId: string;
  /** `OrgPersonModel.id` of the rep who performed this activity — independent of that customer's current `CustomerOwnerModel.owner_person_id`, see the model's own doc comment. */
  personId: string;
  activityType: CollectionActivityType;
  note?: string;
  actorUserId: string;
}

/** Appends one entry to a customer's collections activity ledger (KAN-88's "activity ledger" AC). Never mutated afterward — see `CollectionActivityModel`'s own doc comment. */
export async function recordCollectionActivity(params: RecordCollectionActivityParams): Promise<CollectionActivityModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const customerId = normalizeCustomerId(params.customerId);
  const reasons: string[] = [];
  if (customerId.length === 0) {
    reasons.push('customerId must be a non-empty string.');
  }
  if (!isCollectionActivityType(params.activityType)) {
    reasons.push(`activityType must be one of: ${COLLECTION_ACTIVITY_TYPES.join(', ')}.`);
  }
  if (reasons.length > 0) {
    throw new InvalidRepCollectionError(reasons);
  }
  await requireOrgPersonInOrg(params.organizationId, params.personId);

  const now = new Date().toISOString();
  const trimmedNote = params.note?.trim();

  const activity = new CollectionActivityModel();
  activity.organization_id = params.organizationId;
  activity.project_id = params.projectId;
  activity.customer_id = customerId;
  activity.person_id = params.personId;
  activity.activity_type = params.activityType;
  if (trimmedNote) {
    activity.note = trimmedNote;
  }
  activity.occurred_at = now;
  activity.created_by = params.actorUserId;
  activity.created_at = now;
  activity.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await activity.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'rep_collections.record_activity',
      targetType: 'collection_activity',
      targetId: activity.id,
      summary: `Logged a "${params.activityType}" collections activity for customer "${customerId}"`,
      after: { customerId, personId: params.personId, activityType: params.activityType },
    });
  } catch {
    // Best-effort.
  }

  return activity;
}

/** Same load-bounding reasoning as `DEFAULT_TRACKING_ALERT_LIST_LIMIT` — bounds query cost until a real aggregation store exists. */
export const DEFAULT_COLLECTION_ACTIVITY_LIST_LIMIT = 100;

export interface ListCollectionActivityOptions {
  /** Narrows to one customer's own ledger (the page's per-customer activity view) — omitted lists the whole project's most recent activity across every customer. */
  customerId?: string;
  limit?: number;
}

export async function listCollectionActivityForProject(
  organizationId: string,
  projectId: string,
  options?: ListCollectionActivityOptions,
): Promise<CollectionActivityModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  // No redundant `project_id` filter — the collection path already scopes this to one project
  // (same as `listRecentIngestBatchesForProject`), which keeps the unfiltered listing on a
  // single-field index. The `customer_id` variant needs the composite index declared for
  // `collection_activities` in the repo-root `firestore.indexes.json`.
  const base = CollectionActivityModel.initPath({ organization_id: organizationId, project_id: projectId }).query();
  const scoped = options?.customerId ? base.where('customer_id', '==', normalizeCustomerId(options.customerId)) : base;
  return scoped
    .orderBy('occurred_at', 'desc')
    .limit(options?.limit ?? DEFAULT_COLLECTION_ACTIVITY_LIST_LIMIT)
    .get();
}

export interface RepCollectionsLeaderboardRow {
  /** `OrgPersonModel.id`, or `null` for the "unassigned" bucket (customers with collected revenue but no assigned owner). */
  ownerPersonId: string | null;
  ownerName: string | null;
  collectedRevenue: number;
  customerCount: number;
}

export interface RepCollectionsCustomerRow {
  customerId: string;
  collectedRevenue: number;
  ownerPersonId: string | null;
  ownerName: string | null;
}

export type RepCollectionsLeaderboardOutcome =
  | { ok: true; rows: RepCollectionsLeaderboardRow[]; customers: RepCollectionsCustomerRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

/** Local mirror of `sumByCampaign` (`campaign-target.service.ts`), keyed on `customer_id` instead — same reasoning that file's own `sumMetricRows` copy gives for not sharing one helper across services. */
function sumByCustomer(rows: readonly WarehouseRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const customerId = normalizeCustomerId(String(row.customer_id ?? ''));
    if (customerId.length === 0) {
      continue;
    }
    const raw = row[REP_COLLECTIONS_METRIC_NAME] ?? null;
    const num = raw === null ? 0 : typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      continue;
    }
    totals.set(customerId, (totals.get(customerId) ?? 0) + num);
  }
  return totals;
}

/**
 * The warehouse-backed half of KAN-88's "rep-attributed collections,
 * leaderboards" AC: `collected_revenue_by_customer` (lifetime, the same
 * "running total, not a windowed target" posture `getPaybackOverviewForProject`
 * establishes) merged with every saved {@link CustomerOwnerModel} in the
 * project, then rolled up per rep. A customer with collected revenue but no
 * saved owner rolls into a single `ownerPersonId: null` "unassigned" row
 * rather than being dropped — the same "a human needs to *see* an
 * untargeted row to decide what to do with it" reasoning
 * `getCampaignSpendBreakdownForProject`'s own doc comment gives. Never
 * throws for an expected, per-query-recoverable outcome.
 */
export async function getRepCollectionsLeaderboardForProject(
  organizationId: string,
  projectId: string,
  options?: { executor?: WarehouseQueryExecutor; cache?: MetricQueryResultCache },
): Promise<RepCollectionsLeaderboardOutcome> {
  try {
    const [result, owners, people] = await Promise.all([
      queryMetrics({
        organizationId,
        projectId,
        request: {
          metrics: [REP_COLLECTIONS_METRIC_NAME],
          dimensions: ['customer_id'],
          time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
        },
        ...(options?.executor ? { executor: options.executor } : {}),
        ...(options?.cache ? { cache: options.cache } : {}),
      }),
      listCustomerOwnersForProject(organizationId, projectId),
      OrgPersonModel.initPath({ organization_id: organizationId }).where('organization_id', '==', organizationId).get(),
    ]);

    const revenueByCustomer = sumByCustomer(result.series);
    const ownerByCustomer = new Map(owners.map((owner) => [owner.customer_id, owner.owner_person_id]));
    const nameByPerson = new Map(people.map((person) => [person.id, person.name]));

    // Every customer with either collected revenue or a saved owner is included — an owned
    // customer with zero revenue so far still counts toward its rep's row and still gets its own
    // customer row (the same "a targeted row with zero actuals still appears" posture
    // `getCampaignSpendBreakdownForProject` establishes), rather than only surfacing customers
    // once they have revenue to assign an owner against.
    const everyCustomerId = new Set([...revenueByCustomer.keys(), ...ownerByCustomer.keys()]);

    const totalsByOwner = new Map<string | null, { collectedRevenue: number; customerIds: Set<string> }>();
    const customers: RepCollectionsCustomerRow[] = [];
    for (const customerId of everyCustomerId) {
      const ownerPersonId = ownerByCustomer.get(customerId) ?? null;
      const collectedRevenue = revenueByCustomer.get(customerId) ?? 0;

      const bucket = totalsByOwner.get(ownerPersonId) ?? { collectedRevenue: 0, customerIds: new Set<string>() };
      bucket.collectedRevenue += collectedRevenue;
      bucket.customerIds.add(customerId);
      totalsByOwner.set(ownerPersonId, bucket);

      customers.push({ customerId, collectedRevenue, ownerPersonId, ownerName: ownerPersonId ? (nameByPerson.get(ownerPersonId) ?? null) : null });
    }
    customers.sort((a, b) => b.collectedRevenue - a.collectedRevenue);

    const rows: RepCollectionsLeaderboardRow[] = [...totalsByOwner.entries()].map(([ownerPersonId, bucket]) => ({
      ownerPersonId,
      ownerName: ownerPersonId ? (nameByPerson.get(ownerPersonId) ?? null) : null,
      collectedRevenue: bucket.collectedRevenue,
      customerCount: bucket.customerIds.size,
    }));
    rows.sort((a, b) => b.collectedRevenue - a.collectedRevenue);

    return { ok: true, rows, customers };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    if (error instanceof MetricTargetsUnbuiltWarehouseTableError) {
      return { ok: false, reason: 'not_yet_backed', message: error.message };
    }
    if (
      error instanceof MetricCompilerError ||
      error instanceof ProjectNotFoundError ||
      error instanceof MetricNotRegisteredError ||
      error instanceof WarehouseQueryFailedError
    ) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}

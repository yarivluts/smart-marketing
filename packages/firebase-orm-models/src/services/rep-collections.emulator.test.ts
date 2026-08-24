import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assignCustomerOwner,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureRepCollectionsPackRegistered,
  ensureUserForFirebaseSession,
  getRepCollectionsLeaderboardForProject,
  InMemoryMetricQueryResultCache,
  InvalidRepCollectionError,
  listCollectionActivityForProject,
  listCustomerOwnersForProject,
  ProjectNotFoundError,
  recordCollectionActivity,
  unassignCustomerOwner,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-88's rep-attributed collections ledger (`rep-collections.service.ts`). */

beforeAll(async () => {
  await connectToFirestoreEmulator('rep-collections-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('assignCustomerOwner', () => {
  it('assigns an org person as a customer\'s collections owner, then a second call reassigns it (upsert by customer_id, not a new document)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Customer Owner Assign Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    const sam = await createOrgPerson({ organizationId: organization.id, name: 'Sam Rep', createdByUserId: owner.id });

    const first = await assignCustomerOwner({
      organizationId: organization.id,
      projectId: project.id,
      customerId: 'cus_123',
      ownerPersonId: alex.id,
      actorUserId: owner.id,
    });
    expect(first.owner_person_id).toBe(alex.id);

    const second = await assignCustomerOwner({
      organizationId: organization.id,
      projectId: project.id,
      customerId: 'cus_123',
      ownerPersonId: sam.id,
      actorUserId: owner.id,
    });
    expect(second.id).toBe(first.id);
    expect(second.owner_person_id).toBe(sam.id);

    const all = await listCustomerOwnersForProject(organization.id, project.id);
    expect(all).toHaveLength(1);
  });

  it('rejects an owner that does not belong to this organization', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Customer Owner Invalid Person Org');
    const { organization: otherOrg } = await setupOrgWithProject('Customer Owner Other Org');
    const otherOrgPerson = await createOrgPerson({ organizationId: otherOrg.id, name: 'Outsider', createdByUserId: owner.id });

    await expect(
      assignCustomerOwner({
        organizationId: organization.id,
        projectId: project.id,
        customerId: 'cus_1',
        ownerPersonId: otherOrgPerson.id,
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidRepCollectionError);
  });

  it('normalizes a whitespace-padded customer id, so a later unassign and listing agree with it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Customer Owner Normalize Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    const assigned = await assignCustomerOwner({
      organizationId: organization.id,
      projectId: project.id,
      customerId: '  cus_padded  ',
      ownerPersonId: alex.id,
      actorUserId: owner.id,
    });
    expect(assigned.customer_id).toBe('cus_padded');

    // The un-padded form must resolve to the same document, not create a second one.
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_padded', ownerPersonId: alex.id, actorUserId: owner.id });
    expect(await listCustomerOwnersForProject(organization.id, project.id)).toHaveLength(1);

    // ...and so must a padded unassign.
    await unassignCustomerOwner(organization.id, project.id, ' cus_padded ', owner.id);
    expect(await listCustomerOwnersForProject(organization.id, project.id)).toEqual([]);
  });

  it('rejects an empty customer id', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Customer Owner Empty Id Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    await expect(
      assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: '   ', ownerPersonId: alex.id, actorUserId: owner.id }),
    ).rejects.toThrow(InvalidRepCollectionError);
  });

  it('throws ProjectNotFoundError for a project id from a different org', async () => {
    const { owner, organization } = await setupOrgWithProject('Customer Owner Org A');
    const { project: otherProject } = await setupOrgWithProject('Customer Owner Org B');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    await expect(
      assignCustomerOwner({ organizationId: organization.id, projectId: otherProject.id, customerId: 'cus_1', ownerPersonId: alex.id, actorUserId: owner.id }),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('unassignCustomerOwner', () => {
  it('removes an assignment; unassigning a customer with no owner is a no-op', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Customer Owner Unassign Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_1', ownerPersonId: alex.id, actorUserId: owner.id });

    await unassignCustomerOwner(organization.id, project.id, 'cus_1', owner.id);
    expect(await listCustomerOwnersForProject(organization.id, project.id)).toEqual([]);

    await expect(unassignCustomerOwner(organization.id, project.id, 'never_existed', owner.id)).resolves.toBeUndefined();
  });
});

describe('recordCollectionActivity', () => {
  it('appends a ledger entry and lists it newest-first, optionally scoped to one customer', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Collection Activity Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    await recordCollectionActivity({
      organizationId: organization.id,
      projectId: project.id,
      customerId: 'cus_1',
      personId: alex.id,
      activityType: 'call',
      note: 'Left a voicemail',
      actorUserId: owner.id,
    });
    const second = await recordCollectionActivity({
      organizationId: organization.id,
      projectId: project.id,
      customerId: 'cus_1',
      personId: alex.id,
      activityType: 'payment_collected',
      actorUserId: owner.id,
    });
    await recordCollectionActivity({
      organizationId: organization.id,
      projectId: project.id,
      customerId: 'cus_2',
      personId: alex.id,
      activityType: 'email',
      actorUserId: owner.id,
    });

    const wholeProject = await listCollectionActivityForProject(organization.id, project.id);
    expect(wholeProject).toHaveLength(3);

    const scoped = await listCollectionActivityForProject(organization.id, project.id, { customerId: 'cus_1' });
    expect(scoped).toHaveLength(2);
    expect(scoped[0]?.id).toBe(second.id);
    expect(scoped.every((entry) => entry.customer_id === 'cus_1')).toBe(true);
  });

  it('normalizes the customer id on both write and filter, so a padded id still finds its entries', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Collection Activity Normalize Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    const activity = await recordCollectionActivity({
      organizationId: organization.id,
      projectId: project.id,
      customerId: '  cus_padded  ',
      personId: alex.id,
      activityType: 'call',
      actorUserId: owner.id,
    });
    expect(activity.customer_id).toBe('cus_padded');

    const foundViaPaddedFilter = await listCollectionActivityForProject(organization.id, project.id, { customerId: ' cus_padded ' });
    expect(foundViaPaddedFilter.map((entry) => entry.id)).toEqual([activity.id]);
  });

  it('honours the limit option', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Collection Activity Limit Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    for (const activityType of ['call', 'email', 'note'] as const) {
      await recordCollectionActivity({ organizationId: organization.id, projectId: project.id, customerId: 'cus_1', personId: alex.id, activityType, actorUserId: owner.id });
    }

    expect(await listCollectionActivityForProject(organization.id, project.id, { limit: 2 })).toHaveLength(2);
  });

  it('rejects an unknown activity type and a person outside the organization', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Collection Activity Invalid Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });

    await expect(
      recordCollectionActivity({
        organizationId: organization.id,
        projectId: project.id,
        customerId: 'cus_1',
        personId: alex.id,
        // @ts-expect-error deliberately invalid for this test
        activityType: 'not_a_real_type',
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidRepCollectionError);

    const { organization: otherOrg } = await setupOrgWithProject('Collection Activity Other Org');
    const outsider = await createOrgPerson({ organizationId: otherOrg.id, name: 'Outsider', createdByUserId: owner.id });
    await expect(
      recordCollectionActivity({
        organizationId: organization.id,
        projectId: project.id,
        customerId: 'cus_1',
        personId: outsider.id,
        activityType: 'call',
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidRepCollectionError);
  });
});

describe('getRepCollectionsLeaderboardForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Leaderboard Unconfigured Org');
    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getRepCollectionsLeaderboardForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the pack is not installed yet', async () => {
    const { organization, project } = await setupOrgWithProject('Leaderboard Unregistered Org');
    const outcome = await getRepCollectionsLeaderboardForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('rolls up collected revenue by owning rep, bucketing unowned customers as unassigned', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Leaderboard Merge Org');
    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    const sam = await createOrgPerson({ organizationId: organization.id, name: 'Sam Rep', createdByUserId: owner.id });

    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_alex_1', ownerPersonId: alex.id, actorUserId: owner.id });
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_alex_2', ownerPersonId: alex.id, actorUserId: owner.id });
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_sam_1', ownerPersonId: sam.id, actorUserId: owner.id });
    // Owned but no collected revenue in the warehouse yet — still counted for Sam.
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_sam_2', ownerPersonId: sam.id, actorUserId: owner.id });

    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', customer_id: 'cus_alex_1', collected_revenue_by_customer: 100 },
      { bucket_date: '2026-02-01', customer_id: 'cus_alex_1', collected_revenue_by_customer: 50 },
      { bucket_date: '2026-01-01', customer_id: 'cus_alex_2', collected_revenue_by_customer: 20 },
      { bucket_date: '2026-01-01', customer_id: 'cus_sam_1', collected_revenue_by_customer: 200 },
      { bucket_date: '2026-01-01', customer_id: 'cus_unowned', collected_revenue_by_customer: 30 },
    ];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await getRepCollectionsLeaderboardForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');

    const byOwner = new Map(outcome.rows.map((row) => [row.ownerPersonId, row]));
    expect(byOwner.get(alex.id)).toEqual({ ownerPersonId: alex.id, ownerName: 'Alex Rep', collectedRevenue: 170, customerCount: 2 });
    expect(byOwner.get(sam.id)).toEqual({ ownerPersonId: sam.id, ownerName: 'Sam Rep', collectedRevenue: 200, customerCount: 2 });
    expect(byOwner.get(null)).toEqual({ ownerPersonId: null, ownerName: null, collectedRevenue: 30, customerCount: 1 });
    expect(outcome.rows).toHaveLength(3);
    // Sorted descending by collected revenue.
    expect(outcome.rows.map((row) => row.ownerPersonId)).toEqual([sam.id, alex.id, null]);

    const byCustomer = new Map(outcome.customers.map((row) => [row.customerId, row]));
    expect(byCustomer.get('cus_sam_2')).toEqual({ customerId: 'cus_sam_2', collectedRevenue: 0, ownerPersonId: sam.id, ownerName: 'Sam Rep' });
    expect(byCustomer.get('cus_unowned')).toEqual({ customerId: 'cus_unowned', collectedRevenue: 30, ownerPersonId: null, ownerName: null });
    expect(outcome.customers).toHaveLength(5);
  });

  // Regression guard: a warehouse `customer_id` carrying stray whitespace must bucket onto the
  // same normalized key an assignment was stored under, or the customer splits into two rows —
  // one holding the revenue but unassignable, one holding the owner but showing nothing.
  it('normalizes a whitespace-padded warehouse customer id onto its saved owner', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Leaderboard Normalize Org');
    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    await assignCustomerOwner({ organizationId: organization.id, projectId: project.id, customerId: 'cus_1', ownerPersonId: alex.id, actorUserId: owner.id });

    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-01-01', customer_id: ' cus_1 ', collected_revenue_by_customer: 500 }]);
    const outcome = await getRepCollectionsLeaderboardForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');

    expect(outcome.customers).toEqual([{ customerId: 'cus_1', collectedRevenue: 500, ownerPersonId: alex.id, ownerName: 'Alex Rep' }]);
    expect(outcome.rows).toEqual([{ ownerPersonId: alex.id, ownerName: 'Alex Rep', collectedRevenue: 500, customerCount: 1 }]);
  });

  it('coerces string amounts, treats a null amount as zero, and skips a non-numeric one', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Leaderboard Coercion Org');
    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);

    const executor = new FakeWarehouseQueryExecutor([
      // BigQuery hands back NUMERIC columns as strings.
      { bucket_date: '2026-01-01', customer_id: 'cus_str', collected_revenue_by_customer: '120.5' },
      { bucket_date: '2026-01-01', customer_id: 'cus_null', collected_revenue_by_customer: null },
      { bucket_date: '2026-01-01', customer_id: 'cus_bad', collected_revenue_by_customer: 'not-a-number' },
      // A row with no customer id at all is skipped entirely rather than bucketed under ''.
      { bucket_date: '2026-01-01', customer_id: '', collected_revenue_by_customer: 99 },
    ]);
    const outcome = await getRepCollectionsLeaderboardForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');

    const byCustomer = new Map(outcome.customers.map((row) => [row.customerId, row.collectedRevenue]));
    expect(byCustomer.get('cus_str')).toBe(120.5);
    expect(byCustomer.get('cus_null')).toBe(0);
    // A non-numeric amount is skipped outright rather than counted as zero — so an otherwise
    // unknown customer never materializes a row from a garbage value alone (same as
    // `sumByCampaign`'s own skip). A customer with a saved owner would still get its row.
    expect(byCustomer.has('cus_bad')).toBe(false);
    expect(byCustomer.has('')).toBe(false);
  });
});

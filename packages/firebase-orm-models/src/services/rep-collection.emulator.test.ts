import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  createRepCollectionEntry,
  deleteRepCollectionEntry,
  ensureUserForFirebaseSession,
  getRepCollectionLeaderboardForProject,
  InvalidRepCollectionEntryError,
  listBillingCollectionSignalsForProject,
  listRepCollectionEntriesForProject,
  ProjectNotFoundError,
  RawRecordModel,
  RepCollectionEntryNotFoundError,
  updateRepCollectionEntry,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-88's rep-attributed collections ledger:
 * `createRepCollectionEntry`/`updateRepCollectionEntry`/`deleteRepCollectionEntry`/
 * `listRepCollectionEntriesForProject`, the weekly/monthly
 * `getRepCollectionLeaderboardForProject` aggregation, and the
 * `listBillingCollectionSignalsForProject` billing-auto-suggest read.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('rep-collection-tests');
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const devEnvironment = environments.find((environment) => environment.name === 'dev')!;
  return { owner, organization, project, environmentId: devEnvironment.id };
}

/** Lands one `stripe_charge` raw record with a real event envelope shape (`{event, event_id, ts, properties}`) — reading `payload.amount` directly (rather than `payload.properties.amount`) is a known, documented mistake elsewhere in this codebase (see `listBillingCollectionSignalsForProject`'s own doc comment), so this helper deliberately mirrors the correct shape `churn-reason.emulator.test.ts`/`feedback.emulator.test.ts` already establish, not `pipeline.emulator.test.ts`'s flat (incorrect) fixture. `amount`/`amountRefunded` are Stripe's own smallest-currency-unit convention (cents), matching what a real Stripe charge event carries. */
async function landStripeCharge(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  landedAt: string;
  /** The event envelope's own `ts` — defaults to `landedAt`; set separately to test that `listBillingCollectionSignalsForProject` prefers this over `landed_at`. */
  ts?: string;
  amount?: number;
  amountRefunded?: number;
  currency?: string;
  status?: string;
  refunded?: boolean;
  customerId?: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'stripe_charge';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = {
    charge_id: unique('ch'),
    amount: params.amount ?? 5000,
    currency: params.currency ?? 'usd',
    status: params.status ?? 'succeeded',
    refunded: params.refunded ?? false,
    amount_refunded: params.amountRefunded ?? 0,
  };
  if (params.customerId !== undefined) {
    properties.customer_id = params.customerId;
  }
  record.payload = { event: 'stripe_charge', event_id: unique('event'), ts: params.ts ?? params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

/** Lands one `stripe_failed_payment` event — used to prove `listBillingCollectionSignalsForProject` no longer starves on a burst of non-charge billing events sharing `listRecentBillingEventsForProject`'s merged window (the fixed schema-starvation bug this service's own doc comment documents). */
async function landStripeFailedPayment(params: { organizationId: string; projectId: string; environmentId: string; landedAt: string }): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'stripe_failed_payment';
  record.client_id = unique('client');
  record.payload = {
    event: 'stripe_failed_payment',
    event_id: unique('event'),
    ts: params.landedAt,
    properties: { charge_id: unique('ch'), amount: 1000, currency: 'usd', failure_code: 'card_declined' },
  };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

async function landNonChargeEvent(params: { organizationId: string; projectId: string; environmentId: string; landedAt: string }): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'order_completed';
  record.client_id = unique('client');
  record.payload = { event: 'order_completed', event_id: unique('event'), ts: params.landedAt, properties: { net: 42 } };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('createRepCollectionEntry', () => {
  it('creates an entry attributed to a rep', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Create Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Dana Rep', createdByUserId: owner.id });

    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: rep.id,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      planFrom: 'Starter',
      planTo: 'Pro',
      amount: 500,
      occurredAt: '2026-08-24',
      note: 'Upsell after QBR',
      createdByUserId: owner.id,
    });

    expect(entry.org_person_id).toBe(rep.id);
    expect(entry.company).toBe('Acme Inc');
    expect(entry.collection_type).toBe('upgrade');
    expect(entry.plan_from).toBe('Starter');
    expect(entry.plan_to).toBe('Pro');
    expect(entry.amount).toBe(500);
    expect(entry.note).toBe('Upsell after QBR');
    expect(entry.created_by).toBe(owner.id);
  });

  it('creates an unattributed entry when orgPersonId is null', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Unattributed Org');

    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Beta LLC',
      collectionType: 'renewal',
      amount: 200,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });

    expect(entry.org_person_id).toBeNull();
  });

  it('rejects an empty company, unknown type, non-positive amount, and an invalid date all at once', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Validation Org');

    await expect(
      createRepCollectionEntry({
        organizationId: organization.id,
        projectId: project.id,
        orgPersonId: null,
        company: '   ',
        collectionType: 'not_a_real_type',
        amount: 0,
        occurredAt: 'not-a-date',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidRepCollectionEntryError);
  });

  it('rejects a `Date.parse`-able but non-ISO occurredAt (e.g. "08/24/2026") since it would sort/filter nowhere sensible', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Non-ISO Date Org');

    await expect(
      createRepCollectionEntry({
        organizationId: organization.id,
        projectId: project.id,
        orgPersonId: null,
        company: 'Acme Inc',
        collectionType: 'upgrade',
        amount: 100,
        occurredAt: '08/24/2026',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidRepCollectionEntryError);
  });

  it('accepts a full ISO datetime occurredAt', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection ISO Datetime Org');

    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24T15:30:00.000Z',
      createdByUserId: owner.id,
    });
    expect(entry.occurred_at).toBe('2026-08-24T15:30:00.000Z');
  });

  it('rejects an orgPersonId that does not belong to the organization', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Foreign Rep Org');
    const otherOrgOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('other-owner') });
    const { organization: otherOrg } = await createOrganizationWithOwner({ name: 'Other Org', ownerUserId: otherOrgOwner.id });
    const foreignRep = await createOrgPerson({ organizationId: otherOrg.id, name: 'Foreign Rep', createdByUserId: otherOrgOwner.id });

    await expect(
      createRepCollectionEntry({
        organizationId: organization.id,
        projectId: project.id,
        orgPersonId: foreignRep.id,
        company: 'Acme Inc',
        collectionType: 'upgrade',
        amount: 100,
        occurredAt: '2026-08-24',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidRepCollectionEntryError);
  });

  it('throws ProjectNotFoundError for a project id that does not belong to the given org', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Org A');
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Rep Collection Org B', ownerUserId: owner.id });

    await expect(
      createRepCollectionEntry({
        organizationId: orgB.id,
        projectId: project.id,
        orgPersonId: null,
        company: 'Acme Inc',
        collectionType: 'upgrade',
        amount: 100,
        occurredAt: '2026-08-24',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(project.organization_id).toBe(organization.id);
  });
});

describe('updateRepCollectionEntry', () => {
  it('reassigns the rep and corrects the amount independently', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Update Org');
    const repA = await createOrgPerson({ organizationId: organization.id, name: 'Rep A', createdByUserId: owner.id });
    const repB = await createOrgPerson({ organizationId: organization.id, name: 'Rep B', createdByUserId: owner.id });
    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: repA.id,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });

    const reassigned = await updateRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      entryId: entry.id,
      orgPersonId: repB.id,
      actorUserId: owner.id,
    });
    expect(reassigned.org_person_id).toBe(repB.id);
    expect(reassigned.amount).toBe(100);

    const correctedAmount = await updateRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      entryId: entry.id,
      amount: 150,
      actorUserId: owner.id,
    });
    expect(correctedAmount.org_person_id).toBe(repB.id);
    expect(correctedAmount.amount).toBe(150);
  });

  it('clears the rep when orgPersonId is explicitly set to null', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Unassign Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Rep A', createdByUserId: owner.id });
    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: rep.id,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });

    const unassigned = await updateRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      entryId: entry.id,
      orgPersonId: null,
      actorUserId: owner.id,
    });
    expect(unassigned.org_person_id).toBeNull();
  });

  it('rejects a non-positive amount', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Bad Amount Org');
    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });

    await expect(
      updateRepCollectionEntry({ organizationId: organization.id, projectId: project.id, entryId: entry.id, amount: 0, actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidRepCollectionEntryError);
  });

  it('throws RepCollectionEntryNotFoundError for an unknown entry id', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Missing Org');

    await expect(
      updateRepCollectionEntry({ organizationId: organization.id, projectId: project.id, entryId: 'does-not-exist', amount: 10, actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(RepCollectionEntryNotFoundError);
  });

  it('cannot be used by a different org to mutate an entry by guessing its id (KAN-26 non-enumeration)', async () => {
    const { owner: ownerA, organization: orgA, project: projectA } = await setupOrgWithProject('Rep Collection Isolation Org A');
    const entry = await createRepCollectionEntry({
      organizationId: orgA.id,
      projectId: projectA.id,
      orgPersonId: null,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: ownerA.id,
    });
    const ownerB = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('org-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Rep Collection Isolation Org B', ownerUserId: ownerB.id });
    const { project: projectB } = await createProject({ organizationId: orgB.id, name: 'Other Website' });

    await expect(
      updateRepCollectionEntry({ organizationId: orgB.id, projectId: projectB.id, entryId: entry.id, amount: 999, actorUserId: ownerB.id }),
    ).rejects.toBeInstanceOf(RepCollectionEntryNotFoundError);

    const stillOriginal = await listRepCollectionEntriesForProject(orgA.id, projectA.id);
    expect(stillOriginal.find((row) => row.id === entry.id)?.amount).toBe(100);
  });
});

describe('deleteRepCollectionEntry', () => {
  it('deletes an entry outright', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Delete Org');
    const entry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });

    await deleteRepCollectionEntry(organization.id, project.id, entry.id, owner.id);

    await expect(
      updateRepCollectionEntry({ organizationId: organization.id, projectId: project.id, entryId: entry.id, amount: 10, actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(RepCollectionEntryNotFoundError);
  });

  it('cannot be used by a different org to delete an entry by guessing its id (KAN-26 non-enumeration)', async () => {
    const { owner: ownerA, organization: orgA, project: projectA } = await setupOrgWithProject('Rep Collection Delete Isolation Org A');
    const entry = await createRepCollectionEntry({
      organizationId: orgA.id,
      projectId: projectA.id,
      orgPersonId: null,
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: ownerA.id,
    });
    const ownerB = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('org-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Rep Collection Delete Isolation Org B', ownerUserId: ownerB.id });
    const { project: projectB } = await createProject({ organizationId: orgB.id, name: 'Other Website' });

    await expect(deleteRepCollectionEntry(orgB.id, projectB.id, entry.id, ownerB.id)).rejects.toBeInstanceOf(RepCollectionEntryNotFoundError);

    const stillThere = await listRepCollectionEntriesForProject(orgA.id, projectA.id);
    expect(stillThere.find((row) => row.id === entry.id)).toBeDefined();
  });
});

describe('listRepCollectionEntriesForProject', () => {
  it('sorts newest occurred_at first', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection List Org');
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Older',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-01',
      createdByUserId: owner.id,
    });
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Newer',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-20',
      createdByUserId: owner.id,
    });

    const entries = await listRepCollectionEntriesForProject(organization.id, project.id);
    expect(entries.map((entry) => entry.company)).toEqual(['Newer', 'Older']);
  });
});

describe('getRepCollectionLeaderboardForProject', () => {
  it('sums per rep within the period, sorted highest first, separating out unattributed collections', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collection Leaderboard Org');
    const repA = await createOrgPerson({ organizationId: organization.id, name: 'Rep A', createdByUserId: owner.id });
    const repB = await createOrgPerson({ organizationId: organization.id, name: 'Rep B', createdByUserId: owner.id });
    const now = new Date('2026-08-24T12:00:00.000Z');

    // Rep A: two entries this week, totalling 300.
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: repA.id,
      company: 'Acme',
      collectionType: 'upgrade',
      amount: 100,
      occurredAt: '2026-08-24',
      createdByUserId: owner.id,
    });
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: repA.id,
      company: 'Acme',
      collectionType: 'expansion',
      amount: 200,
      occurredAt: '2026-08-19',
      createdByUserId: owner.id,
    });
    // Rep B: one entry this week, 250 — beats Rep A on a single entry but not on the two-entry total.
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: repB.id,
      company: 'Beta',
      collectionType: 'save',
      amount: 250,
      occurredAt: '2026-08-26',
      createdByUserId: owner.id,
    });
    // Unattributed entry earlier this month, but not in this particular week.
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'Gamma',
      collectionType: 'other',
      amount: 50,
      occurredAt: '2026-08-21',
      createdByUserId: owner.id,
    });
    // Out of this week's window (more than a month prior).
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: repA.id,
      company: 'Old Co',
      collectionType: 'renewal',
      amount: 9999,
      occurredAt: '2026-01-01',
      createdByUserId: owner.id,
    });

    const weekResult = await getRepCollectionLeaderboardForProject({ organizationId: organization.id, projectId: project.id, period: 'week', now });
    // 2026-08-24 is a Monday; the ISO week runs 2026-08-24..2026-08-30, so only Rep A's 100 and Rep B's 250 land inside it.
    expect(weekResult.periodStart).toBe('2026-08-24');
    expect(weekResult.periodEnd).toBe('2026-08-30');
    expect(weekResult.rows).toEqual([
      { orgPersonId: repB.id, totalAmount: 250, entryCount: 1 },
      { orgPersonId: repA.id, totalAmount: 100, entryCount: 1 },
    ]);
    expect(weekResult.unattributedTotal).toBe(0);
    expect(weekResult.unattributedCount).toBe(0);

    const monthResult = await getRepCollectionLeaderboardForProject({ organizationId: organization.id, projectId: project.id, period: 'month', now });
    expect(monthResult.periodStart).toBe('2026-08-01');
    expect(monthResult.periodEnd).toBe('2026-08-31');
    expect(monthResult.rows).toEqual([
      { orgPersonId: repA.id, totalAmount: 300, entryCount: 2 },
      { orgPersonId: repB.id, totalAmount: 250, entryCount: 1 },
    ]);
    expect(monthResult.unattributedTotal).toBe(50);
    expect(monthResult.unattributedCount).toBe(1);
  });
});

describe('listBillingCollectionSignalsForProject', () => {
  it('surfaces only successful, non-refunded, not-yet-linked stripe_charge events', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Rep Collection Signals Org');

    const goodCharge = await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T10:00:00.000Z',
      amount: 4200,
      customerId: 'cus_1',
    });
    await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T09:00:00.000Z',
      status: 'failed',
    });
    await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T08:00:00.000Z',
      refunded: true,
    });
    await landNonChargeEvent({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-08-24T07:00:00.000Z' });

    const signals = await listBillingCollectionSignalsForProject(organization.id, project.id);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      rawRecordId: goodCharge.id,
      // Converted from Stripe's minor-unit cents (4200) to decimal (42) —
      // matching how a manually-typed ledger amount is entered, see
      // `stripeMinorUnitsToDecimal`'s own doc comment.
      amount: 42,
      currency: 'usd',
      customerId: 'cus_1',
      occurredAt: '2026-08-24T10:00:00.000Z',
    });

    // Once attributed, the same charge must never be suggested again.
    await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'cus_1',
      collectionType: 'upgrade',
      amount: 4200,
      occurredAt: goodCharge.landed_at,
      sourceRawRecordId: goodCharge.id,
      createdByUserId: owner.id,
    });

    const signalsAfterLinking = await listBillingCollectionSignalsForProject(organization.id, project.id);
    expect(signalsAfterLinking).toHaveLength(0);
  });

  it('excludes a partially refunded charge even though `refunded` itself is still false', async () => {
    const { organization, project, environmentId } = await setupOrgWithProject('Rep Collection Partial Refund Org');
    await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T10:00:00.000Z',
      amount: 5000,
      amountRefunded: 1500,
      refunded: false,
    });

    const signals = await listBillingCollectionSignalsForProject(organization.id, project.id);
    expect(signals).toHaveLength(0);
  });

  it("prefers the charge's own envelope ts over landed_at (a backfilled charge lands today but happened earlier)", async () => {
    const { organization, project, environmentId } = await setupOrgWithProject('Rep Collection Backfill Ts Org');
    await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T10:00:00.000Z',
      ts: '2026-07-01T09:00:00.000Z',
      amount: 1000,
    });

    const signals = await listBillingCollectionSignalsForProject(organization.id, project.id);
    expect(signals).toHaveLength(1);
    expect(signals[0].occurredAt).toBe('2026-07-01T09:00:00.000Z');
  });

  it('still surfaces a charge candidate even when many stripe_failed_payment events share the same billing-events window (the fixed schema-starvation bug)', async () => {
    const { organization, project, environmentId } = await setupOrgWithProject('Rep Collection Signal Starvation Org');
    for (let i = 0; i < 10; i += 1) {
      await landStripeFailedPayment({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: `2026-08-24T10:0${i}:00.000Z` });
    }
    const charge = await landStripeCharge({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      landedAt: '2026-08-24T09:00:00.000Z',
      amount: 2000,
    });

    const signals = await listBillingCollectionSignalsForProject(organization.id, project.id);
    expect(signals.map((signal) => signal.rawRecordId)).toContain(charge.id);
  });

  it('reuses an already-fetched ledger via existingEntries instead of re-fetching it', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Rep Collection Existing Entries Org');
    const charge = await landStripeCharge({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-08-24T10:00:00.000Z', amount: 1000 });
    const linkedEntry = await createRepCollectionEntry({
      organizationId: organization.id,
      projectId: project.id,
      orgPersonId: null,
      company: 'cus_x',
      collectionType: 'upgrade',
      amount: 10,
      occurredAt: '2026-08-24',
      sourceRawRecordId: charge.id,
      createdByUserId: owner.id,
    });

    // A stale `existingEntries` snapshot taken before the link would wrongly re-suggest the charge —
    // confirming the fresh entries list passed in is actually the one consulted.
    const staleEntries = await listRepCollectionEntriesForProject(organization.id, project.id);
    expect(staleEntries.map((entry) => entry.id)).toContain(linkedEntry.id);
    const signals = await listBillingCollectionSignalsForProject(organization.id, project.id, { existingEntries: staleEntries });
    expect(signals).toHaveLength(0);
  });
});

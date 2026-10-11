import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureStripeCommerceSchemasRegistered,
  ensureUserForFirebaseSession,
  getBillingRecoveryForProject,
  ingestBatch,
  mapChargeToEventRecords,
  type StripeCharge,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

const APP_NAME = 'billing-recovery-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const DAY_S = 24 * 60 * 60;
const T0 = Date.parse('2026-09-01T00:00:00.000Z') / 1000;

function charge(id: string, created: number, overrides: Partial<StripeCharge> = {}): StripeCharge {
  return { id, object: 'charge', amount: 4999, currency: 'usd', customer: 'cus_1', status: 'succeeded', refunded: false, amount_refunded: 0, created, ...overrides };
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: unique('Recovery Org'), ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  await ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id);
  return { organization, project, environments };
}

describe('getBillingRecoveryForProject', () => {
  it('returns an empty summary for a project with no billing records', async () => {
    const { organization, project } = await setup();
    const summary = await getBillingRecoveryForProject(organization.id, project.id, { now: '2026-10-10T00:00:00.000Z' });
    expect(summary.recoveries).toEqual([]);
    expect(summary.recoveryRate).toBeNull();
    expect(summary.failedPaymentsTruncated).toBe(false);
  });

  it('pairs landed failed payments with their recovery from the prod environment, and reports truncation', async () => {
    const { organization, project, environments } = await setup();
    const prod = environments.find((environment) => environment.name === 'prod')!;
    const dev = environments.find((environment) => environment.name === 'dev')!;
    const land = (environmentId: string, charges: StripeCharge[]) =>
      ingestBatch({ organizationId: organization.id, projectId: project.id, environmentId, input: { kind: 'event', records: charges.flatMap(mapChargeToEventRecords) } });

    await land(prod.id, [
      charge('ch_fail', T0, { status: 'failed', failure_code: 'card_declined' }),
      charge('ch_ok', T0 + 2 * DAY_S),
      charge('ch_fail_2', T0, { status: 'failed', customer: 'cus_2', amount: 1000 }),
    ]);
    // A recovery-looking charge in another environment must not pair with a prod failure.
    await land(dev.id, [charge('ch_dev_ok', T0 + DAY_S, { customer: 'cus_2', amount: 1000 })]);

    const summary = await getBillingRecoveryForProject(organization.id, project.id, { now: '2026-10-10T00:00:00.000Z' });
    expect(summary.recoveries).toHaveLength(1);
    expect(summary.recoveries[0]).toMatchObject({ customerId: 'cus_1', recoveryChargeId: 'ch_ok', hoursToRecover: 48 });
    expect(summary.recoveredByCurrency).toEqual([{ currency: 'USD', amountMinorUnits: 4999, payments: 1 }]);
    expect(summary.failedAttempts).toEqual({ recovered: 1, unrecovered: 1, pending: 0, unpairable: 0 });

    const capped = await getBillingRecoveryForProject(organization.id, project.id, { now: '2026-10-10T00:00:00.000Z', limit: 1 });
    expect(capped.failedPaymentsTruncated).toBe(true);
    expect(capped.chargesTruncated).toBe(true);
  });
});

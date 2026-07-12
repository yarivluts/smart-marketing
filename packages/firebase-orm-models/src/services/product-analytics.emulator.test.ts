import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  completeOnboarding,
  confirmOnboardingFunnelSteps,
  createOrganizationWithOwner,
  createProject,
  ensureProductAnalyticsProject,
  ensureUserForFirebaseSession,
  getOrCreateOnboardingState,
  markOnboardingSourceConnected,
  RawRecordModel,
  recordActivationEvent,
  selectOnboardingMetricPack,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-70's dogfood activation-funnel instrumentation. */

beforeAll(async () => {
  await connectToFirestoreEmulator('product-analytics-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupDesignPartnerProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Design Partner Co' });
  return { owner, organization, project };
}

async function setupStaffOwner() {
  return ensureUserForFirebaseSession({ firebaseUid: unique('staff-firebase-uid'), email: uniqueEmail('staff') });
}

describe('ensureProductAnalyticsProject', () => {
  it('is a no-op (returns null) when GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID is unset', async () => {
    const result = await ensureProductAnalyticsProject({});
    expect(result).toBeNull();
  });

  it('bootstraps the internal org/project/environment/schema once configured, and is idempotent', async () => {
    const staff = await setupStaffOwner();
    const env = { GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID: staff.id };

    const first = await ensureProductAnalyticsProject(env);
    const second = await ensureProductAnalyticsProject(env);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });
});

describe('recordActivationEvent', () => {
  it('is a no-op (returns null) when unconfigured, and never throws', async () => {
    const { organization, project } = await setupDesignPartnerProject('Unconfigured Dogfood Org');
    const result = await recordActivationEvent({
      funnelStep: 'onboarding_started',
      targetOrganizationId: organization.id,
      targetProjectId: project.id,
    });
    expect(result).toBeNull();
  });
});

describe('onboarding wizard wiring (KAN-70 AC: "our own GrowthOS project tracks activation of design partners")', () => {
  it('lands one activation event per funnel step into the internal analytics project, scoped away from the design partner project it describes', async () => {
    // selectOnboardingMetricPack alone (installing + provisioning a real metric pack) can take
    // tens of seconds under this emulator's load — same slow-step reasoning onboarding.emulator.test.ts's
    // own pack-install test already accepts; the default 30s test timeout isn't enough for the full
    // five-step wizard run below.
    const staff = await setupStaffOwner();
    process.env.GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID = staff.id;
    try {
      const { owner, organization, project } = await setupDesignPartnerProject('Wired Dogfood Org');

      await getOrCreateOnboardingState(organization.id, project.id, owner.id);
      await selectOnboardingMetricPack({
        organizationId: organization.id,
        projectId: project.id,
        userId: owner.id,
        packKey: 'saas_marketing',
      });
      await markOnboardingSourceConnected({
        organizationId: organization.id,
        projectId: project.id,
        userId: owner.id,
        method: 'push_your_own',
      });
      await confirmOnboardingFunnelSteps({
        organizationId: organization.id,
        projectId: project.id,
        userId: owner.id,
        steps: [{ order: 0, eventSchemaName: 'signup', stageKey: 'signup' }],
      });
      await completeOnboarding({ organizationId: organization.id, projectId: project.id, userId: owner.id });

      const internal = await ensureProductAnalyticsProject({ GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID: staff.id });
      expect(internal).not.toBeNull();
      // The internal analytics project is never the design partner's own project — hard isolation
      // (KAN-26) applies here too: dogfood telemetry about a project must not live inside that project.
      expect(internal!.organizationId).not.toBe(organization.id);
      expect(internal!.projectId).not.toBe(project.id);

      const raw = await listRawRecordsForBatchAcrossOnboarding(internal!.organizationId, internal!.projectId, organization.id, project.id);
      const steps = raw.map((r) => (r.payload as { properties?: { funnel_step?: string } }).properties?.funnel_step).sort();
      expect(steps).toEqual(
        ['funnel_confirmed', 'onboarding_completed', 'onboarding_started', 'pack_selected', 'source_connected'].sort(),
      );

      const packSelected = raw.find(
        (r) => (r.payload as { properties?: { funnel_step?: string } }).properties?.funnel_step === 'pack_selected',
      )!;
      expect((packSelected.payload as { properties: { pack_key?: string } }).properties.pack_key).toBe('saas_marketing');
    } finally {
      delete process.env.GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID;
    }
  }, 120000);
});

/** `listRawRecordsForBatch` is keyed by one batch id, but this test fires five separate ingest batches (one per funnel step) — so instead this queries every raw record landed in the internal project whose `properties.target_organization_id`/`target_project_id` matches the design partner project under test. */
async function listRawRecordsForBatchAcrossOnboarding(
  internalOrgId: string,
  internalProjectId: string,
  targetOrgId: string,
  targetProjectId: string,
) {
  const all = await RawRecordModel.initPath({ organization_id: internalOrgId, project_id: internalProjectId })
    .where('project_id', '==', internalProjectId)
    .get();
  return all.filter((record) => {
    const properties = (record.payload as { properties?: { target_organization_id?: string; target_project_id?: string } })
      .properties;
    return properties?.target_organization_id === targetOrgId && properties?.target_project_id === targetProjectId;
  });
}

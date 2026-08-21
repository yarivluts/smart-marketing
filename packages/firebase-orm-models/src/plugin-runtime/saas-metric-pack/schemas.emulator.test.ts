import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileMetricQueryForProject,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveSchemaDefinition,
  martViewName,
  registerSchemaDefinition,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureSaasMetricPackRegistered } from './index';
import { AD_SPEND_MEASURE_NAME, ensureSaasMetricPackSchemasRegistered } from './schemas';

/**
 * Emulator-backed tests for the `ad_spend` measure schema this pack
 * self-provisions (the follow-up that makes `ad_spend` queryable against a
 * real warehouse mart view instead of the nonexistent `fact_ad_spend` table
 * every other aggregation-kind metric here still targets — see `metrics.ts`'s
 * own doc comment on `AD_SPEND`).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('saas-metric-pack-schemas-tests');
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

describe('ensureSaasMetricPackSchemasRegistered', () => {
  it('registers the ad_spend measure schema with its own channel/campaign/adset/ad dimension fields, no value/ts fields (those are the mart\'s reserved intrinsics)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('SaaS Pack Schemas Org');

    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);

    const schema = await getActiveSchemaDefinition(organization.id, project.id, 'measure', AD_SPEND_MEASURE_NAME);
    expect(schema).not.toBeNull();
    expect(schema?.field_defs.map((field) => field.name).sort()).toEqual(['ad_id', 'adset_id', 'campaign_id', 'channel_id']);
    expect(schema?.field_defs.some((field) => field.name === 'value' || field.name === 'ts')).toBe(false);
  });

  it('is idempotent: a second call registers no duplicate version', async () => {
    const { owner, organization, project } = await setupOrgWithProject('SaaS Pack Schemas Idempotent Org');

    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);
    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);

    const schema = await getActiveSchemaDefinition(organization.id, project.id, 'measure', AD_SPEND_MEASURE_NAME);
    expect(schema?.version).toBe(1);
  });

  it('leaves a human-registered ad_spend schema untouched rather than throwing', async () => {
    const { owner, organization, project } = await setupOrgWithProject('SaaS Pack Schemas Human Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'measure',
      name: AD_SPEND_MEASURE_NAME,
      fields: [{ name: 'region', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    await expect(ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id)).resolves.toBeUndefined();

    const schema = await getActiveSchemaDefinition(organization.id, project.id, 'measure', AD_SPEND_MEASURE_NAME);
    expect(schema?.field_defs.map((field) => field.name)).toEqual(['region']);
  });
});

describe('ad_spend metric resolves against the real mart view (KAN-59 fact_ad_spend follow-up)', () => {
  it('compiles ad_spend\'s aggregation.table to the project\'s own mart view name, not the literal schema name', async () => {
    const { owner, organization, project } = await setupOrgWithProject('SaaS Pack Ad Spend Mart Org');

    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-31', grain: 'month' } },
    });

    const expectedMartTable = martViewName(organization.id, project.id, AD_SPEND_MEASURE_NAME);
    expect(compiled.sql).toContain(expectedMartTable);
    expect(compiled.definitionRefs).toEqual({ ad_spend: 'metric:ad_spend@v1' });
  });

  it('still compiles ad_spend by its plain schema name when no matching schema is registered yet (pre-install-order safety net)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('SaaS Pack Ad Spend No Schema Org');

    // Deliberately register only the metric, not the schema — proves compilation degrades to the
    // literal table name (matching `mapCustomSchemaTables`'s documented pass-through behavior)
    // rather than throwing, if a future caller ever registers metrics before schemas.
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const compiled = await compileMetricQueryForProject({
      organizationId: organization.id,
      projectId: project.id,
      request: { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-31', grain: 'month' } },
    });

    expect(compiled.sql).toContain('ad_spend');
  });
});

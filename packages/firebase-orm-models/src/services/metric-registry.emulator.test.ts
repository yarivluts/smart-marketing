import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  DuplicateMetricDefinitionError,
  ensureUserForFirebaseSession,
  evolveMetricDefinition,
  getActiveMetricDefinition,
  InvalidMetricDefinitionError,
  listAuditLogEntriesForOrg,
  listMetricDefinitionsForProject,
  listMetricDefinitionVersions,
  MetricDefNotFoundError,
  ProjectNotFoundError,
  registerMetricDefinition,
  type MetricDefinitionInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-40's metric definition format + validation service. */

beforeAll(async () => {
  await connectToFirestoreEmulator('metric-registry-tests');
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

const adSpendDefinition: MetricDefinitionInput = {
  kind: 'aggregation',
  aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [] },
};

const signupsDefinition: MetricDefinitionInput = {
  kind: 'aggregation',
  aggregation: {
    function: 'count_distinct',
    table: 'fact_funnel_event',
    column: 'customer_id',
    filters: [{ field: 'step', operator: '=', value: 'signup' }],
  },
};

describe('registerMetricDefinition', () => {
  it('registers v1 of a new aggregation metric', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Register Org');
    const metricDef = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: ['channel', 'campaign'],
      createdByUserId: owner.id,
    });

    expect(metricDef.version).toBe(1);
    expect(metricDef.status).toBe('active');
    expect(metricDef.definition_kind).toBe('aggregation');
    expect(metricDef.aggregation).toEqual({ function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [] });
    expect(metricDef.dimensions).toEqual(['channel', 'campaign']);
  });

  it('registers a formula metric referencing already-active metrics', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Formula Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: signupsDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });

    const costPerSignup = await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cost_per_signup',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    expect(costPerSignup.definition_kind).toBe('formula');
    expect(costPerSignup.formula).toBe('ad_spend / signups');
  });

  it('rejects registering the same name twice', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Duplicate Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'ad_spend',
        definition: adSpendDefinition,
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(DuplicateMetricDefinitionError);
  });

  it('rejects an unknown project id', async () => {
    const { owner, organization } = await setupOrgWithProject('Metric No Project Org');
    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        name: 'ad_spend',
        definition: adSpendDefinition,
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects an invalid name, an unknown aggregation function, a missing column, and a bad filter', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Invalid Org');

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'Ad Spend!',
        definition: adSpendDefinition,
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'bad_function',
        definition: { kind: 'aggregation', aggregation: { function: 'median', table: 'fact_ad_spend', column: 'spend', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'missing_column',
        definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'bad_filter',
        definition: {
          kind: 'aggregation',
          aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'spend', filters: [{ field: 'step', operator: 'contains', value: 'x' }] },
        },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);
  });

  it('rejects a formula with disallowed characters, unbalanced parens, and no metric references', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Bad Formula Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'injected',
        definition: { kind: 'formula', formula: "ad_spend; DROP TABLE" },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'unbalanced',
        definition: { kind: 'formula', formula: '(ad_spend / 2' },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'no_refs',
        definition: { kind: 'formula', formula: '1 + 2' },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);
  });

  it('rejects a formula referencing an unregistered metric', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Unknown Ref Org');
    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'cac',
        definition: { kind: 'formula', formula: 'ad_spend / new_paying' },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);
  });

  it('rejects a formula that references its own name', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Self Ref Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'cac',
        definition: { kind: 'formula', formula: 'ad_spend / cac' },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);
  });

  it('rejects duplicate and empty dimension names', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Dimension Org');
    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'ad_spend',
        definition: adSpendDefinition,
        dimensions: ['channel', 'channel'],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    await expect(
      registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'ad_spend',
        definition: adSpendDefinition,
        dimensions: ['  '],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);
  });
});

describe('evolveMetricDefinition', () => {
  it('evolves v1 to v2 — both versions stay independently queryable', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Evolve Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });

    const v2Definition: MetricDefinitionInput = {
      kind: 'aggregation',
      aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [{ field: 'platform', operator: '!=', value: 'test' }] },
    };
    const v2 = await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: v2Definition,
      dimensions: ['channel', 'campaign'],
      createdByUserId: owner.id,
    });

    expect(v2.version).toBe(2);
    expect(v2.status).toBe('active');
    expect(v2.dimensions).toEqual(['channel', 'campaign']);

    const versions = await listMetricDefinitionVersions(organization.id, project.id, 'ad_spend');
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(1);
    expect(versions[0].status).toBe('superseded');
    expect(versions[1].version).toBe(2);
    expect(versions[1].status).toBe('active');

    const active = await getActiveMetricDefinition(organization.id, project.id, 'ad_spend');
    expect(active?.version).toBe(2);
  });

  it('rejects evolving a metric that was never registered', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Evolve Missing Org');
    await expect(
      evolveMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'never_registered',
        definition: adSpendDefinition,
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(MetricDefNotFoundError);
  });

  it('allows a metric to switch from aggregation to formula on evolve', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Switch Kind Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: signupsDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'placeholder',
      definition: { kind: 'formula', formula: 'ad_spend / 1' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const evolved = await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'placeholder',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    expect(evolved.formula).toBe('ad_spend / signups');
  });

  it('rejects a formula evolution that would create a circular dependency between metrics', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Cycle Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    // metric_b starts as a plain aggregation so metric_a can legally reference it.
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'metric_b',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'metric_a',
      definition: { kind: 'formula', formula: 'ad_spend / metric_b' },
      dimensions: [],
      createdByUserId: owner.id,
    });

    // Evolving metric_b to depend on metric_a would close the loop: a -> b -> a.
    await expect(
      evolveMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'metric_b',
        definition: { kind: 'formula', formula: 'metric_a / 2' },
        dimensions: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidMetricDefinitionError);

    // The rejected evolution didn't create a new version.
    const versions = await listMetricDefinitionVersions(organization.id, project.id, 'metric_b');
    expect(versions).toHaveLength(1);
  });
});

describe('audit log wiring', () => {
  it('records a real audit entry for both register and evolve — the aggregation/formula fields must not be written as `undefined`, which Firestore rejects', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Audit Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [{ field: 'platform', operator: '!=', value: 'test' }] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('metric_def.register');
    expect(actions).toContain('metric_def.evolve');
  });
});

describe('listMetricDefinitionsForProject', () => {
  it('lists every version of every metric family in a project, isolated from other projects', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric List Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: signupsDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: otherProject.id,
      name: 'ad_spend',
      definition: adSpendDefinition,
      dimensions: [],
      createdByUserId: owner.id,
    });

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name).sort()).toEqual(['ad_spend', 'signups']);

    const otherDefs = await listMetricDefinitionsForProject(organization.id, otherProject.id);
    expect(otherDefs).toHaveLength(1);
  });
});

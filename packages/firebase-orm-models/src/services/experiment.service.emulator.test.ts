import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, InMemoryMetricQueryResultCache, type WarehouseQueryExecutor } from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';
import { ensureExperimentPackRegistered } from '../plugin-runtime/experiment-pack';
import { getExperimentResultsForProject } from './experiment.service';

beforeAll(async () => {
  await connectToFirestoreEmulator('experiment-service-tests');
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

describe('getExperimentResultsForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Experiment Results Org');
    await ensureExperimentPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getExperimentResultsForProject(organization.id, project.id);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the pack is not installed yet', async () => {
    const { organization, project } = await setupOrgWithProject('Experiment Results Unregistered Org');

    const outcome = await getExperimentResultsForProject(organization.id, project.id);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('counts each variant\'s distinct customers over the experiment\'s whole lifetime as ONE bucket, not once per calendar year (B24)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Experiment Results Total Grain Org');
    await ensureExperimentPackRegistered(organization.id, project.id, owner.id);
    const queries: { sql: string }[] = [];
    const executor: WarehouseQueryExecutor = {
      execute: (query) => {
        queries.push(query);
        return Promise.resolve([]);
      },
    };

    const outcome = await getExperimentResultsForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });

    expect(outcome.ok).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('CAST(@time_start_current AS DATE) AS bucket_date');
    expect(queries[0].sql).not.toContain('DATE_TRUNC');
  });
});

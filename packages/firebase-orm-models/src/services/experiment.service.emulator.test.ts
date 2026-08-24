import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '../index';
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
});

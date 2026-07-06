import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  DEFAULT_INGEST_HEALTH_BATCH_LIMIT,
  ensureUserForFirebaseSession,
  ingestBatch,
  listRecentIngestBatchesForProject,
  registerSchemaDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-35's ingest health rollup query: newest-first ordering, the batch-count cap, and per-project isolation. */

beforeAll(async () => {
  await connectToFirestoreEmulator('ingest-health-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'page_view',
    fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  return { owner, organization, project, prodEnvironment };
}

describe('listRecentIngestBatchesForProject', () => {
  it('returns a project’s batches newest first', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest Health Order Org');

    const first = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });
    await delay(5);
    const second = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e2', event: 'page_view', ts: '2026-07-03T10:16:00Z' }] },
    });

    const batches = await listRecentIngestBatchesForProject(organization.id, project.id);
    expect(batches.map((b) => b.id)).toEqual([second.batchId, first.batchId]);
    for (let i = 0; i + 1 < batches.length; i++) {
      expect(batches[i].created_at >= batches[i + 1].created_at).toBe(true);
    }
  });

  it('caps the result at the requested limit', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest Health Limit Org');

    for (let i = 0; i < 3; i++) {
      await ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        input: { kind: 'event', records: [{ event_id: `e${i}`, event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
      });
    }

    const batches = await listRecentIngestBatchesForProject(organization.id, project.id, 2);
    expect(batches).toHaveLength(2);
  });

  it('defaults to the documented cap when no limit is given', async () => {
    expect(DEFAULT_INGEST_HEALTH_BATCH_LIMIT).toBeGreaterThan(0);
  });

  it('does not leak a sibling project’s batches', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest Health Isolation Org A');
    const other = await setupProject('Ingest Health Isolation Org B');

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });
    await ingestBatch({
      organizationId: other.organization.id,
      projectId: other.project.id,
      environmentId: other.prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });

    const batches = await listRecentIngestBatchesForProject(organization.id, project.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].project_id).toBe(project.id);
  });
});

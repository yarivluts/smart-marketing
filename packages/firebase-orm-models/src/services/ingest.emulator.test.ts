import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  EmptyIngestBatchError,
  ensureUserForFirebaseSession,
  getIngestBatch,
  IngestBatchTooLargeError,
  ingestBatch,
  registerSchemaDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-32's ingest service: schema validation, idempotency dedup, and batch persistence. */

beforeAll(async () => {
  await connectToFirestoreEmulator('ingest-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  const devEnvironment = environments.find((e) => e.name === 'dev')!;
  return { owner, organization, project, prodEnvironment, devEnvironment };
}

describe('ingestBatch — events', () => {
  it('accepts a well-formed event validated against its registered schema', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Events Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: [{ name: 'net', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [
          {
            event_id: 'ord_5001-evt',
            event: 'order_completed',
            ts: '2026-07-03T10:15:00Z',
            properties: { net: 349.0 },
          },
        ],
      },
    });

    expect(summary.kind).toBe('event');
    expect(summary.total).toBe(1);
    expect(summary.accepted).toBe(1);
    expect(summary.quarantined).toBe(0);
    expect(summary.duplicates).toBe(0);

    const batch = await getIngestBatch(organization.id, project.id, prodEnvironment.id, summary.batchId);
    expect(batch?.record_results).toEqual([{ client_id: 'ord_5001-evt', status: 'accepted' }]);
  });

  it('quarantines an event whose schema was never registered', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Unregistered Schema Org');

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'unknown_event', ts: '2026-07-03T10:15:00Z' }] },
    });

    expect(summary.accepted).toBe(0);
    expect(summary.quarantined).toBe(1);
    const batch = await getIngestBatch(organization.id, project.id, prodEnvironment.id, summary.batchId);
    expect(batch?.record_results[0]).toEqual({
      client_id: 'e1',
      status: 'quarantined',
      reasons: ['schema_not_registered:unknown_event'],
    });
  });

  it('quarantines a missing required field, an unregistered field, and a type mismatch', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Field Validation Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
        { name: 'age', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [
          { event_id: 'e-missing', event: 'signup', ts: '2026-07-03T10:15:00Z', properties: {} },
          {
            event_id: 'e-unknown',
            event: 'signup',
            ts: '2026-07-03T10:15:00Z',
            properties: { plan: 'pro', referrer: 'google' },
          },
          { event_id: 'e-mismatch', event: 'signup', ts: '2026-07-03T10:15:00Z', properties: { plan: 'pro', age: 'old' } },
        ],
      },
    });

    expect(summary.quarantined).toBe(3);
    const batch = await getIngestBatch(organization.id, project.id, prodEnvironment.id, summary.batchId);
    const byId = new Map(batch!.record_results.map((r) => [r.client_id, r]));
    expect(byId.get('e-missing')?.reasons).toEqual(['missing_required_field:plan']);
    expect(byId.get('e-unknown')?.reasons).toEqual(['unregistered_field:referrer']);
    expect(byId.get('e-mismatch')?.reasons).toEqual(['field_type_mismatch:age']);
  });

  it('dedupes a repeated event_id within the same batch and across a later batch', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Dedup Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const first = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [
          { event_id: 'dup-1', event: 'page_view', ts: '2026-07-03T10:15:00Z' },
          { event_id: 'dup-1', event: 'page_view', ts: '2026-07-03T10:16:00Z' },
        ],
      },
    });
    expect(first.accepted).toBe(1);
    expect(first.duplicates).toBe(1);

    const second = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'dup-1', event: 'page_view', ts: '2026-07-03T10:17:00Z' }] },
    });
    expect(second.accepted).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it('does not dedupe the same event_id across two different environments', async () => {
    const { owner, organization, project, prodEnvironment, devEnvironment } = await setupProject('Cross Env Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const prodResult = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'same-id', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });
    const devResult = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'same-id', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });

    expect(prodResult.accepted).toBe(1);
    expect(devResult.accepted).toBe(1);
  });

  it('lets a quarantined record be accepted on a corrected retry with the same event_id', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Retry Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const bad = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'retry-1', event: 'signup', ts: '2026-07-03T10:15:00Z' }] },
    });
    expect(bad.quarantined).toBe(1);

    const fixed = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'retry-1', event: 'signup', ts: '2026-07-03T10:15:00Z', properties: { plan: 'pro' } }],
      },
    });
    expect(fixed.accepted).toBe(1);
  });

  it('rejects an empty batch and a batch over the size cap', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Batch Limits Org');

    await expect(
      ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        input: { kind: 'event', records: [] },
      }),
    ).rejects.toBeInstanceOf(EmptyIngestBatchError);

    const oversized = Array.from({ length: 1001 }, (_, i) => ({
      event_id: `e${i}`,
      event: 'page_view',
      ts: '2026-07-03T10:15:00Z',
    }));
    await expect(
      ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        input: { kind: 'event', records: oversized },
      }),
    ).rejects.toBeInstanceOf(IngestBatchTooLargeError);
  });
});

describe('ingestBatch — entities', () => {
  it('validates every record against the batch-level "type", accepting and quarantining independently', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Entities Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'product',
      fields: [{ name: 'price', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'entity',
        type: 'product',
        records: [
          { id: 'sku_1', attributes: { price: 19.99 } },
          { id: 'sku_2', attributes: {} },
        ],
      },
    });

    expect(summary.accepted).toBe(1);
    expect(summary.quarantined).toBe(1);
  });
});

describe('ingestBatch — measures', () => {
  it('derives an idempotency key from measure+ts+dimensions when no client id is given', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Measures Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'measure',
      name: 'ad_spend',
      fields: [{ name: 'channel', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const record = { measure: 'ad_spend', ts: '2026-07-02', dimensions: { channel: 'meta' }, value: 1250.5, currency: 'USD' };
    const first = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'measure', records: [record] },
    });
    const second = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'measure', records: [record] },
    });

    expect(first.accepted).toBe(1);
    expect(second.duplicates).toBe(1);
  });
});

describe('getIngestBatch', () => {
  it('returns null for a batch id from a sibling project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Isolation Org');
    const other = await setupProject('Other Isolation Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] },
    });

    const fromOtherProject = await getIngestBatch(
      other.organization.id,
      other.project.id,
      other.prodEnvironment.id,
      summary.batchId,
    );
    expect(fromOtherProject).toBeNull();

    const fromOwnEnvironment = await getIngestBatch(organization.id, project.id, prodEnvironment.id, summary.batchId);
    expect(fromOwnEnvironment?.total_count).toBe(1);
  });
});

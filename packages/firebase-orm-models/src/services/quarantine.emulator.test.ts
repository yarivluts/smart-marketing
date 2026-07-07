import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  evolveSchemaDefinition,
  getIngestBatch,
  ingestBatch,
  listQuarantinedRecordsForProject,
  listRawRecordsForBatch,
  QuarantinedRecordNotFoundError,
  registerSchemaDefinition,
  replayQuarantinedRecord,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-34's quarantine durability + replay: a schema fix followed by replay must succeed. */

beforeAll(async () => {
  await connectToFirestoreEmulator('quarantine-service-tests');
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
  return { owner, organization, project, prodEnvironment };
}

describe('ingestBatch — durable quarantine records', () => {
  it('persists a durable QuarantinedRecordModel for a schema-field failure, carrying the raw payload', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Durable Quarantine Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'e-referrer', event: 'signup', ts: '2026-07-07T10:00:00Z', properties: { plan: 'pro', referrer: 'google' } }],
      },
    });

    const quarantined = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].client_id).toBe('e-referrer');
    expect(quarantined[0].status).toBe('quarantined');
    expect(quarantined[0].reasons).toEqual(['unregistered_field:referrer']);
    expect(quarantined[0].payload).toEqual({
      event_id: 'e-referrer',
      event: 'signup',
      ts: '2026-07-07T10:00:00Z',
      properties: { plan: 'pro', referrer: 'google' },
    });
  });

  it('persists a durable quarantine entry for an envelope-level failure too (missing event_id)', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Envelope Quarantine Org');

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event: 'signup', ts: '2026-07-07T10:00:00Z' }] },
    });

    const quarantined = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reasons).toEqual(['missing_field:event_id']);
  });

  it('does not persist a durable quarantine entry for an accepted or duplicate record', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('No Quarantine For Accepted Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [
          { event_id: 'dup-1', event: 'page_view', ts: '2026-07-07T10:00:00Z' },
          { event_id: 'dup-1', event: 'page_view', ts: '2026-07-07T10:01:00Z' },
        ],
      },
    });

    const quarantined = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined).toHaveLength(0);
  });
});

describe('replayQuarantinedRecord', () => {
  it('accepts a record on replay after the schema is evolved to register its previously-unknown field', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Replay Success Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const original = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'e-fixable', event: 'signup', ts: '2026-07-07T10:00:00Z', properties: { plan: 'pro', referrer: 'google' } }],
      },
    });
    expect(original.quarantined).toBe(1);

    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined.reasons).toEqual(['unregistered_field:referrer']);

    // Schema fix: evolve to register the field that was previously rejected as unknown.
    await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
        { name: 'referrer', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });

    const result = await replayQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);
    expect(result).toEqual({ outcome: 'accepted' });

    const [updated] = await listQuarantinedRecordsForProject(organization.id, project.id);
    // No longer surfaced by the "still needs action" list — status flipped to `replayed`.
    expect(updated).toBeUndefined();

    // The replayed record actually landed in the warehouse raw-table stand-in (KAN-33), keyed by the
    // *original* batch id it was first quarantined under.
    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, original.batchId);
    expect(rawRecords.map((r) => r.client_id)).toEqual(['e-fixable']);

    // A later resend of the same event_id now dedupes against the replayed record's claimed slot.
    const resend = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'e-fixable', event: 'signup', ts: '2026-07-07T10:05:00Z', properties: { plan: 'pro', referrer: 'google' } }],
      },
    });
    expect(resend.duplicates).toBe(1);
  });

  it('leaves a record quarantined with refreshed reasons when replay still fails', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Replay Still Fails Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e-still-bad', event: 'signup', ts: '2026-07-07T10:00:00Z' }] },
    });
    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined.reasons).toEqual(['missing_required_field:plan']);

    const result = await replayQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);
    expect(result).toEqual({ outcome: 'still_quarantined', reasons: ['missing_required_field:plan'] });

    const [stillThere] = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(stillThere.status).toBe('quarantined');
  });

  it('resolves as duplicate, not accepted, when another accepted record already claimed the same dedup slot', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Replay Duplicate Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    // Quarantined for an unregistered field — its own reasons will clear once the schema evolves to
    // register `referrer`, without needing any change to the persisted payload itself.
    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'race-1', event: 'signup', ts: '2026-07-07T10:00:00Z', properties: { plan: 'pro', referrer: 'x' } }],
      },
    });
    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(quarantined.reasons).toEqual(['unregistered_field:referrer']);

    // Meanwhile, someone resends the same event_id with a payload that already satisfies the
    // as-yet-unevolved schema (simply omitting the extra field) — accepted through the normal ingest
    // path, claiming the dedup slot before the operator gets around to replaying the quarantined copy.
    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'race-1', event: 'signup', ts: '2026-07-07T10:05:00Z', properties: { plan: 'pro' } }],
      },
    });

    // Now the schema is evolved — the originally-quarantined record's own payload would validate too.
    await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
        { name: 'referrer', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });

    const result = await replayQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);
    expect(result).toEqual({ outcome: 'duplicate' });
  });

  it('throws QuarantinedRecordNotFoundError for an id from a sibling project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Isolation Org A');
    const other = await setupProject('Isolation Org B');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'signup', ts: '2026-07-07T10:00:00Z' }] },
    });
    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);

    await expect(
      replayQuarantinedRecord(other.organization.id, other.project.id, quarantined.id, other.owner.id),
    ).rejects.toBeInstanceOf(QuarantinedRecordNotFoundError);
  });

  it('throws QuarantinedRecordNotFoundError for an unknown id', async () => {
    const { owner, organization, project } = await setupProject('Unknown Id Org');
    await expect(
      replayQuarantinedRecord(organization.id, project.id, 'does-not-exist', owner.id),
    ).rejects.toBeInstanceOf(QuarantinedRecordNotFoundError);
  });
});

describe('getIngestBatch after replay', () => {
  it("keeps the original batch's own record_results unchanged — replay history lives on the quarantine record, not retroactively edited batch history", async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Immutable Batch History Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const original = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: {
        kind: 'event',
        records: [{ event_id: 'e-immutable', event: 'signup', ts: '2026-07-07T10:00:00Z', properties: { plan: 'pro', referrer: 'x' } }],
      },
    });
    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);

    await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
        { name: 'referrer', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });
    await replayQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);

    const batch = await getIngestBatch(organization.id, project.id, prodEnvironment.id, original.batchId);
    expect(batch?.record_results).toEqual([
      { client_id: 'e-immutable', status: 'quarantined', reasons: ['unregistered_field:referrer'] },
    ]);
    expect(batch?.quarantined_count).toBe(1);
  });
});

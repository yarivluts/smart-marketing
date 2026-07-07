import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  acceptInvite,
  AuditLogEntryModel,
  createOrganizationWithOwner,
  createProject,
  drainPendingPipelineMessages,
  enqueueAcceptedRecordsForPipeline,
  ensureUserForFirebaseSession,
  evolveSchemaDefinition,
  ingestBatch,
  inviteMemberToOrganization,
  listAuditLogEntriesForOrg,
  listQuarantinedRecordsForProject,
  mintApiKey,
  recordAuditLogEntry,
  registerSchemaDefinition,
  removeOrgMember,
  replayFailedPipelineMessagesForProject,
  replayQuarantinedRecord,
  revokeApiKey,
  verifyAuditLogChainForOrg,
  type PipelineRecordEnvelope,
  type WarehouseSink,
} from '../index';
import { buildHashableContent, computeEntryHash } from './audit-log.service';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-44's audit log service: hash-chain integrity, org scoping, and the wiring into the mutation call sites that emit entries. */

beforeAll(async () => {
  await connectToFirestoreEmulator('audit-log-service-tests');
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

describe('recordAuditLogEntry: hash chain', () => {
  it('links the first entry onto an empty prev_entry_hash, and the second entry onto the first', async () => {
    const { owner, organization } = await setupProject('Chain Org');

    const first = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: 'a',
      summary: 'first',
    });
    expect(first.prev_entry_hash).toBe('');
    expect(first.entry_hash).toMatch(/^[0-9a-f]{64}$/);

    const second = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.two',
      targetType: 'test',
      targetId: 'b',
      summary: 'second',
    });
    expect(second.prev_entry_hash).toBe(first.entry_hash);
    expect(second.entry_hash).not.toBe(first.entry_hash);
  });

  it('round-trips a nested before/after snapshot through a save + reload without breaking the chain', async () => {
    const { owner, organization } = await setupProject('Canonical Hash Org');

    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.canon',
      targetType: 'test',
      targetId: 'a',
      summary: 's',
      after: { z: 1, a: { y: 2, b: 3 } },
    });

    // Verification re-reads the entry from Firestore and recomputes its hash
    // from scratch — this only passes if `canonicalize` produces the exact
    // same content both at write time and after a real round-trip.
    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toEqual({ valid: true, entryCount: 1 });
  });
});

describe('listAuditLogEntriesForOrg', () => {
  it('returns entries newest first, scoped to one org', async () => {
    const { owner, organization } = await setupProject('List Org A');
    const other = await setupProject('List Org B');

    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: '1',
      summary: 'one',
    });
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.two',
      targetType: 'test',
      targetId: '2',
      summary: 'two',
    });
    await recordAuditLogEntry({
      organizationId: other.organization.id,
      actorType: 'user',
      actorId: other.owner.id,
      action: 'test.other',
      targetType: 'test',
      targetId: '3',
      summary: 'stray',
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.map((e) => e.action)).toEqual(['test.two', 'test.one']);
  });
});

describe('verifyAuditLogChainForOrg', () => {
  it('reports a fresh, untampered chain as valid', async () => {
    const { owner, organization } = await setupProject('Valid Chain Org');
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: '1',
      summary: 'one',
    });
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.two',
      targetType: 'test',
      targetId: '2',
      summary: 'two',
    });

    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toEqual({ valid: true, entryCount: 2 });
  });

  it('reports valid for an org with no entries at all', async () => {
    const { organization } = await setupProject('Empty Chain Org');
    expect(await verifyAuditLogChainForOrg(organization.id)).toEqual({ valid: true, entryCount: 0 });
  });

  it('detects a hash_mismatch when an entry is edited directly after being written', async () => {
    const { owner, organization } = await setupProject('Tampered Content Org');
    const entry = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: '1',
      summary: 'original summary',
    });

    const reloaded = await AuditLogEntryModel.init(entry.id, { organization_id: organization.id });
    reloaded!.summary = 'tampered summary';
    await reloaded!.save();

    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hash_mismatch');
    expect(result.brokenAtEntryId).toBe(entry.id);
  });

  it('detects a chain_break when a later entry is retargeted to a forged prev_entry_hash', async () => {
    const { owner, organization } = await setupProject('Tampered Link Org');
    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: '1',
      summary: 'one',
    });
    const second = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.two',
      targetType: 'test',
      targetId: '2',
      summary: 'two',
    });

    // A genuine `chain_break` (as opposed to `hash_mismatch`) requires the
    // entry to still be *self-consistent* — its own `entry_hash` correctly
    // recomputes from its own content — while its `prev_entry_hash` no
    // longer matches the entry that actually precedes it. Forging just
    // `prev_entry_hash` alone (leaving the old `entry_hash` in place) instead
    // produces a `hash_mismatch`, since `entry_hash` is computed *over*
    // `prev_entry_hash` — so this recomputes a consistent hash for the forged
    // link, the same shape a benign concurrent-append fork would produce.
    const reloaded = await AuditLogEntryModel.init(second.id, { organization_id: organization.id });
    const forgedPrevHash = 'a'.repeat(64);
    const forgedContent = buildHashableContent({
      organization_id: reloaded!.organization_id,
      project_id: reloaded!.project_id,
      environment_id: reloaded!.environment_id,
      actor_type: reloaded!.actor_type,
      actor_id: reloaded!.actor_id,
      action: reloaded!.action,
      target_type: reloaded!.target_type,
      target_id: reloaded!.target_id,
      summary: reloaded!.summary,
      before: reloaded!.before,
      after: reloaded!.after,
      created_at: reloaded!.created_at,
      prev_entry_hash: forgedPrevHash,
    });
    reloaded!.prev_entry_hash = forgedPrevHash;
    reloaded!.entry_hash = computeEntryHash(forgedContent);
    await reloaded!.save();

    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('chain_break');
    expect(result.brokenAtEntryId).toBe(second.id);
  });
});

describe('audit-log wiring into mutation call sites (KAN-44)', () => {
  it('records api_key.mint and api_key.revoke', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Key Audit Org');

    const { apiKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Prod key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });
    await revokeApiKey({ organizationId: organization.id, projectId: project.id, apiKeyId: apiKey.id, revokedByUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.map((e) => e.action)).toEqual(['api_key.revoke', 'api_key.mint']);
    expect(entries.every((e) => e.target_id === apiKey.id && e.actor_id === owner.id)).toBe(true);
  });

  it('records schema_def.register and schema_def.evolve', async () => {
    const { owner, organization, project } = await setupProject('Schema Audit Org');

    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
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

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.map((e) => e.action)).toEqual(['schema_def.evolve', 'schema_def.register']);
    expect(entries[1].target_id).toBe(schemaDef.id);
  });

  it('records membership.role_granted on invite acceptance and membership.removed on removal', async () => {
    const { owner, organization } = await setupProject('Membership Audit Org');
    const memberEmail = uniqueEmail('member');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const member = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: memberEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });
    await removeOrgMember(organization.id, invitation.id, owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.map((e) => e.action)).toEqual(['membership.removed', 'membership.role_granted']);
    expect(entries[1].actor_id).toBe(member.id);
    expect(entries[0].actor_id).toBe(owner.id);
  });

  it('records quarantined_record.replay', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Quarantine Audit Org');
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

    await replayQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const replayEntry = entries.find((e) => e.action === 'quarantined_record.replay');
    expect(replayEntry?.target_id).toBe(quarantined.id);
    expect(replayEntry?.actor_id).toBe(owner.id);
  });

  function alwaysFailingSink(): WarehouseSink {
    return {
      insertRawRecord: async (_row: PipelineRecordEnvelope, _id: string) => {
        throw new Error('simulated warehouse outage');
      },
    };
  }

  async function setupOneFailedMessage(organizationId: string, projectId: string, environmentId: string) {
    const batchId = unique('batch');
    await enqueueAcceptedRecordsForPipeline({
      organizationId,
      projectId,
      environmentId,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: {} }],
    });
    await drainPendingPipelineMessages({ organizationId, projectId, environmentId, sink: alwaysFailingSink() });
  }

  it('records pipeline_message.replay with delivered/failed counts when an actor performs the replay', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Pipeline Audit Org');
    await setupOneFailedMessage(organization.id, project.id, prodEnvironment.id);

    const result = await replayFailedPipelineMessagesForProject(organization.id, project.id, undefined, undefined, owner.id);
    expect(result).toEqual({ delivered: 1, failed: 0 });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const replayEntry = entries.find((e) => e.action === 'pipeline_message.replay');
    expect(replayEntry?.actor_id).toBe(owner.id);
    expect(replayEntry?.after).toEqual({ attempted: 1, delivered: 1, failed: 0 });
  });

  it('records nothing when replayFailedPipelineMessagesForProject is called with no actor (e.g. a future scheduled worker)', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Pipeline No-Actor Org');
    await setupOneFailedMessage(organization.id, project.id, prodEnvironment.id);

    await replayFailedPipelineMessagesForProject(organization.id, project.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((e) => e.action === 'pipeline_message.replay')).toBe(false);
  });
});

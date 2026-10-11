import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  acceptInvite,
  AuditLogEntryModel,
  createOrganizationWithOwner,
  createProject,
  dismissQuarantinedRecord,
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
  it('links the first entry onto an empty prev_entry_hash, and every entry after onto the previous one', async () => {
    const { owner, organization } = await setupProject('Chain Org');

    // `setupProject` -> `createOrganizationWithOwner` already wrote the org's
    // genesis entry (`organization.create`, KAN-44 follow-up) — assert the
    // empty-prev_entry_hash genesis behavior directly against it, rather than
    // assuming this test's own first `recordAuditLogEntry` call is the org's
    // first entry ever.
    const [genesis] = await listAuditLogEntriesForOrg(organization.id);
    expect(genesis.action).toBe('organization.create');
    expect(genesis.prev_entry_hash).toBe('');
    expect(genesis.entry_hash).toMatch(/^[0-9a-f]{64}$/);

    const first = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.one',
      targetType: 'test',
      targetId: 'a',
      summary: 'first',
    });
    expect(first.prev_entry_hash).toBe(genesis.entry_hash);
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
    // entryCount is 2, not 1: `setupProject` itself records one
    // `organization.create` entry (KAN-44 follow-up) ahead of this one.
    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toEqual({ valid: true, entryCount: 2, forks: [] });
  });

  it('round-trips client_type/client_id (KAN-77) and keeps the chain valid alongside entries that omit them', async () => {
    const { owner, organization } = await setupProject('Client Identity Org');

    await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'api_key',
      actorId: 'key-1',
      action: 'mcp.tool_call',
      targetType: 'mcp_tool',
      targetId: 'list_metrics',
      summary: 'MCP tool call: list_metrics',
      clientType: 'mcp_api_key',
      clientId: 'key-1',
    });
    // A second, ordinary entry with no client identity at all — the pre-existing shape every non-MCP
    // audit call site still writes — must chain onto the first without either entry's hash changing.
    const second = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.no_client_identity',
      targetType: 'test',
      targetId: 'b',
      summary: 's',
    });
    expect(second.client_type).toBeUndefined();
    expect(second.client_id).toBeUndefined();

    // entryCount is 3, not 2: `setupProject` itself records one
    // `organization.create` entry (KAN-44 follow-up) ahead of the two above.
    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toEqual({ valid: true, entryCount: 3, forks: [] });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const mcpEntry = entries.find((entry) => entry.action === 'mcp.tool_call');
    expect(mcpEntry?.client_type).toBe('mcp_api_key');
    expect(mcpEntry?.client_id).toBe('key-1');
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

    // `setupProject` itself records an `organization.create` entry (KAN-44
    // follow-up) — scope this assertion to the entries this test wrote.
    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.filter((e) => e.action.startsWith('test.')).map((e) => e.action)).toEqual(['test.two', 'test.one']);
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

    // Chain length is 3, not 2: `setupProject` itself records one
    // `organization.create` entry (KAN-44 follow-up) ahead of the two below.
    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toEqual({ valid: true, entryCount: 3, forks: [] });
  });

  it('reports valid for an org with no entries beyond its own organization.create', async () => {
    const { organization } = await setupProject('Empty Chain Org');
    expect(await verifyAuditLogChainForOrg(organization.id)).toEqual({ valid: true, entryCount: 1, forks: [] });
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
      seq: reloaded!.seq,
      prev_entry_hash: forgedPrevHash,
    });
    reloaded!.prev_entry_hash = forgedPrevHash;
    reloaded!.entry_hash = computeEntryHash(forgedContent);
    await reloaded!.save();

    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('chain_break');
    expect(result.brokenAtEntryId).toBe(second.id);
    expect(result.brokenEntry).toMatchObject({ id: second.id, action: 'test.two', actorType: 'user', actorId: owner.id });
  });

  it('reports a chain_break when an entry other entries link onto is deleted', async () => {
    const { owner, organization } = await setupProject('Deleted Entry Org');
    const middle = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.middle',
      targetType: 'test',
      targetId: '1',
      summary: 'middle',
    });
    const after = await recordAuditLogEntry({
      organizationId: organization.id,
      actorType: 'user',
      actorId: owner.id,
      action: 'test.after',
      targetType: 'test',
      targetId: '2',
      summary: 'after',
    });

    const reloaded = await AuditLogEntryModel.init(middle.id, { organization_id: organization.id });
    await reloaded!.remove();

    const result = await verifyAuditLogChainForOrg(organization.id);
    expect(result).toMatchObject({ valid: false, reason: 'chain_break', brokenAtEntryId: after.id });
  });
});

/**
 * Writer regressions behind prod org JGTxet9aGXV6xUPWYidR's "tampered" banner (2026-10-10): 46 of
 * its 717 entries linked onto an entry that was not the one appended just before them - 13
 * `metric_def.register` entries written by one `Promise.all` all linking onto one parent, and
 * entries from hosts with disagreeing clocks linking onto a "newest by created_at" entry that was
 * not the most recent append. No entry's own hash was wrong and no parent was missing.
 */
describe('recordAuditLogEntry: concurrent and clock-skewed appends stay linear', () => {
  it('chains concurrent appends for one org one after another instead of forking them', async () => {
    const { owner, organization } = await setupProject('Concurrent Append Org');

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        recordAuditLogEntry({
          organizationId: organization.id,
          actorType: 'user',
          actorId: owner.id,
          action: 'metric_def.register',
          targetType: 'metric_def',
          targetId: `metric-${index}`,
          summary: `Registered metric ${index}`,
        }),
      ),
    );

    const entries = (await listAuditLogEntriesForOrg(organization.id)).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    expect(entries).toHaveLength(13);
    expect(entries.map((entry) => entry.seq)).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
    entries.slice(1).forEach((entry, index) => expect(entry.prev_entry_hash).toBe(entries[index].entry_hash));
    expect(await verifyAuditLogChainForOrg(organization.id)).toEqual({ valid: true, entryCount: 13, forks: [] });
  });

  it('keeps appending after a failed append without blocking the org queue', async () => {
    const { owner, organization } = await setupProject('Failed Append Org');
    // The first queued append's write fails; the one queued behind it must still run.
    const saveSpy = vi.spyOn(AuditLogEntryModel.prototype, 'save').mockRejectedValueOnce(new Error('simulated write failure'));
    try {
      const failing = recordAuditLogEntry({
        organizationId: organization.id,
        actorType: 'user',
        actorId: owner.id,
        action: 'test.fail',
        targetType: 'test',
        targetId: 'x',
        summary: 'fails',
      });
      const next = recordAuditLogEntry({
        organizationId: organization.id,
        actorType: 'user',
        actorId: owner.id,
        action: 'test.next',
        targetType: 'test',
        targetId: 'y',
        summary: 'next',
      });
      await expect(failing).rejects.toThrow('simulated write failure');
      // seq 2: the org's `organization.create` entry is 1 and the failed append wrote nothing.
      await expect(next).resolves.toMatchObject({ action: 'test.next', seq: 2 });
    } finally {
      saveSpy.mockRestore();
    }
    expect(await verifyAuditLogChainForOrg(organization.id)).toEqual({ valid: true, entryCount: 2, forks: [] });
  });

  it('links onto the most recent append even when an earlier writer stamped a time ahead of this clock', async () => {
    const { owner, organization } = await setupProject('Clock Skew Org');
    const base = { organizationId: organization.id, actorType: 'user' as const, actorId: owner.id, targetType: 'test', summary: 's' };

    // A host whose clock runs a minute ahead (prod showed apps/api up to 44s ahead of apps/web).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
    let ahead: AuditLogEntryModel;
    try {
      ahead = await recordAuditLogEntry({ ...base, action: 'mcp.tool_call', targetId: 'a' });
    } finally {
      vi.useRealTimers();
    }
    const revokeA = await recordAuditLogEntry({ ...base, action: 'api_key.revoke', targetId: 'b' });
    const revokeB = await recordAuditLogEntry({ ...base, action: 'api_key.revoke', targetId: 'c' });

    expect(revokeA.created_at < ahead.created_at).toBe(true);
    expect(revokeA.prev_entry_hash).toBe(ahead.entry_hash);
    // Ordering by created_at would pick `ahead` again here and fork the chain.
    expect(revokeB.prev_entry_hash).toBe(revokeA.entry_hash);
    expect(await verifyAuditLogChainForOrg(organization.id)).toEqual({ valid: true, entryCount: 4, forks: [] });
  });

  it('continues an org whose entries predate seq from its newest entry, and reports the old fork as benign', async () => {
    // A bare org id: entries written the pre-seq way (no `seq`, two siblings forked off one parent).
    const organizationId = unique('legacy-org');
    async function writeLegacy(action: string, createdAt: string, prevEntryHash: string): Promise<AuditLogEntryModel> {
      const content = buildHashableContent({
        organization_id: organizationId,
        actor_type: 'user',
        actor_id: 'user-1',
        action,
        target_type: 'test',
        target_id: action,
        summary: action,
        created_at: createdAt,
        prev_entry_hash: prevEntryHash,
      });
      const entry = new AuditLogEntryModel();
      Object.assign(entry, content);
      entry.entry_hash = computeEntryHash(content);
      entry.setPathParams({ organization_id: organizationId });
      await entry.save();
      return entry;
    }
    const genesis = await writeLegacy('plugin.install', '2026-08-16T19:50:09.408Z', '');
    const siblingA = await writeLegacy('metric_def.register', '2026-08-16T19:50:09.512Z', genesis.entry_hash);
    const siblingB = await writeLegacy('metric_def.register', '2026-08-16T19:50:09.516Z', genesis.entry_hash);

    const next = await recordAuditLogEntry({
      organizationId,
      actorType: 'user',
      actorId: 'user-1',
      action: 'board.create',
      targetType: 'board',
      targetId: 'b',
      summary: 'Created board',
    });
    expect(next.seq).toBe(1);
    expect(next.prev_entry_hash).toBe(siblingB.entry_hash);

    const result = await verifyAuditLogChainForOrg(organizationId);
    expect(result.valid).toBe(true);
    expect(result.entryCount).toBe(4);
    expect(result.forks).toEqual([
      {
        parent: expect.objectContaining({ id: genesis.id, action: 'plugin.install' }),
        branches: [expect.objectContaining({ id: siblingA.id }), expect.objectContaining({ id: siblingB.id })],
      },
    ]);
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
    const keyEntries = entries.filter((e) => e.action.startsWith('api_key.'));
    expect(keyEntries.map((e) => e.action)).toEqual(['api_key.revoke', 'api_key.mint']);
    expect(keyEntries.every((e) => e.target_id === apiKey.id && e.actor_id === owner.id)).toBe(true);
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
    const schemaEntries = entries.filter((e) => e.action.startsWith('schema_def.'));
    expect(schemaEntries.map((e) => e.action)).toEqual(['schema_def.evolve', 'schema_def.register']);
    expect(schemaEntries[1].target_id).toBe(schemaDef.id);
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
    const membershipEntries = entries.filter((e) => e.action.startsWith('membership.'));
    expect(membershipEntries.map((e) => e.action)).toEqual(['membership.removed', 'membership.role_granted']);
    expect(membershipEntries[1].actor_id).toBe(member.id);
    expect(membershipEntries[0].actor_id).toBe(owner.id);
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

  it('records quarantined_record.dismiss', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Quarantine Dismiss Audit Org');
    await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [{ event_id: 'e1', event: 'signup', ts: '2026-07-07T10:00:00Z' }] },
    });
    const [quarantined] = await listQuarantinedRecordsForProject(organization.id, project.id);

    await dismissQuarantinedRecord(organization.id, project.id, quarantined.id, owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const dismissEntry = entries.find((e) => e.action === 'quarantined_record.dismiss');
    expect(dismissEntry?.target_id).toBe(quarantined.id);
    expect(dismissEntry?.actor_id).toBe(owner.id);
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

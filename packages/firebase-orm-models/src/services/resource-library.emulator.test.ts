import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AttachmentNotApprovedError,
  AttachmentNotCredentialError,
  AttachmentNotFoundError,
  AttachmentNotPendingError,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  createResourceTemplate,
  createSharedCredential,
  decideResourceAttachment,
  detachResource,
  ensureUserForFirebaseSession,
  InvalidScopeSelectionError,
  InvalidWriteTierError,
  listActiveAttachmentsForProject,
  listAttachmentsForProject,
  listAuditLogEntriesForOrg,
  listOrgPeople,
  listPendingAttachmentsForOrg,
  listResourceTemplates,
  listSharedCredentials,
  ProjectNotFoundError,
  pushResourceAttachment,
  requestResourceAttachment,
  ResourceAttachmentModel,
  ResourceNotFoundError,
  setResourceAttachmentWriteTier,
  updateOrgPerson,
  verifyAuditLogChainForOrg,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-27's Org Resource Library service layer. */

beforeAll(async () => {
  await connectToFirestoreEmulator('resource-library-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithOwner(name: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name, ownerUserId: owner.id });
  return { owner, organization };
}

describe('shared credentials, templates, and people registry: create + list', () => {
  it('creates and lists a shared credential scoped to its org', async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta Business Manager',
      provider: 'meta_ads',
      availableScopes: ['act_111', 'act_222', 'act_333'],
      createdByUserId: owner.id,
    });

    expect(credential.organization_id).toBe(organization.id);
    expect(credential.available_scopes).toEqual(['act_111', 'act_222', 'act_333']);

    const credentials = await listSharedCredentials(organization.id);
    expect(credentials.map((c) => c.id)).toContain(credential.id);
  });

  it('creates and lists a resource template, versioned from 1', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Standard SaaS Funnel',
      type: 'metric_definition',
      config: { steps: ['signup', 'activation', 'paid'] },
      createdByUserId: owner.id,
    });

    expect(template.version).toBe(1);
    const templates = await listResourceTemplates(organization.id);
    expect(templates.map((t) => t.id)).toContain(template.id);
  });

  it('creates and lists an org person (people registry)', async () => {
    const { owner, organization } = await setupOrgWithOwner('People Org');
    const person = await createOrgPerson({
      organizationId: organization.id,
      name: 'Jordan Rep',
      email: uniqueEmail('jordan'),
      title: 'Account Manager',
      createdByUserId: owner.id,
    });

    const people = await listOrgPeople(organization.id);
    expect(people.map((p) => p.id)).toContain(person.id);
  });
});

describe('updateOrgPerson (KAN-99)', () => {
  it('updates a person\'s name, email, title, and photo URL, persisted for a later list', async () => {
    const { owner, organization } = await setupOrgWithOwner('People Update Org');
    const person = await createOrgPerson({
      organizationId: organization.id,
      name: 'Jordan Rep',
      email: uniqueEmail('jordan'),
      title: 'Account Manager',
      createdByUserId: owner.id,
    });

    const newEmail = uniqueEmail('jordan-smith');
    const updated = await updateOrgPerson({
      organizationId: organization.id,
      personId: person.id,
      name: 'Jordan Smith',
      email: newEmail,
      title: 'Senior Account Manager',
      photoUrl: 'https://example.com/jordan-smith.png',
      actorId: owner.id,
    });

    expect(updated.name).toBe('Jordan Smith');
    expect(updated.email).toBe(newEmail);
    expect(updated.title).toBe('Senior Account Manager');
    expect(updated.photo_url).toBe('https://example.com/jordan-smith.png');

    const [reloaded] = (await listOrgPeople(organization.id)).filter((p) => p.id === person.id);
    expect(reloaded.name).toBe('Jordan Smith');
    expect(reloaded.email).toBe(newEmail);
  });

  it('clears email/title/photoUrl when omitted, without touching the name', async () => {
    const { owner, organization } = await setupOrgWithOwner('People Clear Org');
    const person = await createOrgPerson({
      organizationId: organization.id,
      name: 'Full Fields',
      email: uniqueEmail('full'),
      title: 'Rep',
      photoUrl: 'https://example.com/full.png',
      createdByUserId: owner.id,
    });

    const updated = await updateOrgPerson({
      organizationId: organization.id,
      personId: person.id,
      name: 'Full Fields',
      actorId: owner.id,
    });

    expect(updated.name).toBe('Full Fields');
    expect(updated.email).toBeUndefined();
    expect(updated.title).toBeUndefined();
    expect(updated.photo_url).toBeUndefined();
  });

  it('rejects updating a person id that does not exist', async () => {
    const { owner, organization } = await setupOrgWithOwner('People Missing Org');
    await expect(
      updateOrgPerson({ organizationId: organization.id, personId: 'does-not-exist', name: 'X', actorId: owner.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it("rejects updating another org's person, even with a real person id (isolation)", async () => {
    const { owner: ownerA, organization: orgA } = await setupOrgWithOwner('People Isolation Org A');
    const { owner: ownerB, organization: orgB } = await setupOrgWithOwner('People Isolation Org B');
    const personInA = await createOrgPerson({ organizationId: orgA.id, name: 'Org A Rep', createdByUserId: ownerA.id });

    await expect(
      updateOrgPerson({ organizationId: orgB.id, personId: personInA.id, name: 'Hijacked', actorId: ownerB.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('records an audit log entry with before/after values', async () => {
    const { owner, organization } = await setupOrgWithOwner('People Audit Org');
    const person = await createOrgPerson({
      organizationId: organization.id,
      name: 'Before Name',
      email: uniqueEmail('before'),
      createdByUserId: owner.id,
    });
    const beforeEmail = person.email;

    await updateOrgPerson({
      organizationId: organization.id,
      personId: person.id,
      name: 'After Name',
      title: 'New Title',
      actorId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const [entry] = entries.filter((e) => e.action === 'org_person.update');
    expect(entry).toBeDefined();
    expect(entry.actor_id).toBe(owner.id);
    expect(entry.target_type).toBe('org_person');
    expect(entry.target_id).toBe(person.id);
    expect(entry.before).toEqual({ name: 'Before Name', email: beforeEmail, title: null, photoUrl: null });
    expect(entry.after).toEqual({ name: 'After Name', email: null, title: 'New Title', photoUrl: null });

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });
});

describe('resource attachment lifecycle: request -> approve -> detach', () => {
  it('two projects attach the same org credential, each seeing only its own selected ad accounts; detach revokes immediately (KAN-27 AC)', async () => {
    const { owner, organization } = await setupOrgWithOwner('Slicing Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Shared Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_aaa', 'act_bbb', 'act_ccc'],
      createdByUserId: owner.id,
    });
    const { project: projectA } = await createProject({ organizationId: organization.id, name: 'Client A' });
    const { project: projectB } = await createProject({ organizationId: organization.id, name: 'Client B' });

    const requestA = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: projectA.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_aaa'],
    });
    const requestB = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: projectB.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_bbb', 'act_ccc'],
    });
    expect(requestA.status).toBe('pending');

    const pending = await listPendingAttachmentsForOrg(organization.id);
    expect(pending.map((a) => a.id).sort()).toEqual([requestA.id, requestB.id].sort());

    await decideResourceAttachment({
      organizationId: organization.id,
      attachmentId: requestA.id,
      decidedByUserId: owner.id,
      approve: true,
    });
    await decideResourceAttachment({
      organizationId: organization.id,
      attachmentId: requestB.id,
      decidedByUserId: owner.id,
      approve: true,
    });

    const activeForA = await listActiveAttachmentsForProject(organization.id, projectA.id);
    expect(activeForA).toHaveLength(1);
    expect(activeForA[0].scope_selection).toEqual(['act_aaa']);

    const activeForB = await listActiveAttachmentsForProject(organization.id, projectB.id);
    expect(activeForB).toHaveLength(1);
    expect(activeForB[0].scope_selection).toEqual(['act_bbb', 'act_ccc']);
    // Project B's slice never includes act_aaa, and vice versa — the actual isolation property.
    expect(activeForB[0].scope_selection).not.toContain('act_aaa');

    await detachResource({ organizationId: organization.id, attachmentId: requestA.id, actorId: owner.id });

    const activeForAAfterDetach = await listActiveAttachmentsForProject(organization.id, projectA.id);
    expect(activeForAAfterDetach).toHaveLength(0);
    // Detaching A never touches B's still-approved attachment.
    const activeForBAfterDetach = await listActiveAttachmentsForProject(organization.id, projectB.id);
    expect(activeForBAfterDetach).toHaveLength(1);

    const allForA = await listAttachmentsForProject(organization.id, projectA.id);
    expect(allForA).toHaveLength(1);
    expect(allForA[0].status).toBe('detached');
  });

  it('rejects a scope selection that is not a subset of the credential\'s available scopes', async () => {
    const { owner, organization } = await setupOrgWithOwner('Invalid Scope Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Narrow Credential',
      provider: 'google_ads',
      availableScopes: ['act_only'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });

    await expect(
      requestResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        requestedByUserId: owner.id,
        scopeSelection: ['act_only', 'act_not_granted'],
      }),
    ).rejects.toThrow(InvalidScopeSelectionError);

    await expect(
      requestResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        requestedByUserId: owner.id,
        scopeSelection: [],
      }),
    ).rejects.toThrow(InvalidScopeSelectionError);
  });

  it('supports rejecting a pending request, which stays terminal', async () => {
    const { owner, organization } = await setupOrgWithOwner('Reject Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rejected Rep', createdByUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });

    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'person',
      resourceId: person.id,
      requestedByUserId: owner.id,
    });

    const rejected = await decideResourceAttachment({
      organizationId: organization.id,
      attachmentId: request.id,
      decidedByUserId: owner.id,
      approve: false,
    });
    expect(rejected.status).toBe('rejected');

    const active = await listActiveAttachmentsForProject(organization.id, project.id);
    expect(active).toHaveLength(0);

    await expect(
      decideResourceAttachment({
        organizationId: organization.id,
        attachmentId: request.id,
        decidedByUserId: owner.id,
        approve: true,
      }),
    ).rejects.toThrow(AttachmentNotPendingError);
  });

  it('rejects detaching an attachment that is not currently approved', async () => {
    const { owner, organization } = await setupOrgWithOwner('Detach Guard Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Some Template',
      type: 'dashboard',
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });

    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'template',
      resourceId: template.id,
      requestedByUserId: owner.id,
    });

    await expect(detachResource({ organizationId: organization.id, attachmentId: request.id, actorId: owner.id })).rejects.toThrow(
      AttachmentNotApprovedError,
    );
  });

  it("pins a template attachment to the version current at request time, unaffected by later template edits (KAN-27 \"copy-with-link + version pin\")", async () => {
    const { owner, organization } = await setupOrgWithOwner('Version Pin Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Standard SaaS Funnel',
      type: 'metric_definition',
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Pinned Project' });

    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'template',
      resourceId: template.id,
      requestedByUserId: owner.id,
    });
    expect(request.resource_version).toBe(1);

    // Nothing in this codebase bumps a template's version yet (no edit
    // surface exists) — directly mutate it to simulate a later org-admin
    // edit and confirm the already-recorded pin doesn't silently follow it.
    template.version = 2;
    await template.save();

    const reloaded = await ResourceAttachmentModel.init(request.id, { organization_id: organization.id });
    expect(reloaded?.resource_version).toBe(1);
  });

  it('rejects requesting attachment for a project or resource that does not belong to the org', async () => {
    const { owner, organization: orgA } = await setupOrgWithOwner('Org A');
    const { organization: orgB } = await setupOrgWithOwner('Org B');
    const credentialInOrgA = await createSharedCredential({
      organizationId: orgA.id,
      name: 'Org A Credential',
      provider: 'generic',
      availableScopes: ['scope-1'],
      createdByUserId: owner.id,
    });
    const { project: projectInOrgB } = await createProject({ organizationId: orgB.id, name: 'Org B Project' });
    const { project: projectInOrgA } = await createProject({ organizationId: orgA.id, name: 'Org A Project' });

    await expect(
      requestResourceAttachment({
        organizationId: orgA.id,
        projectId: projectInOrgB.id,
        resourceKind: 'credential',
        resourceId: credentialInOrgA.id,
        requestedByUserId: owner.id,
        scopeSelection: ['scope-1'],
      }),
    ).rejects.toThrow(ProjectNotFoundError);

    await expect(
      requestResourceAttachment({
        organizationId: orgB.id,
        projectId: projectInOrgB.id,
        resourceKind: 'credential',
        resourceId: credentialInOrgA.id,
        requestedByUserId: owner.id,
        scopeSelection: ['scope-1'],
      }),
    ).rejects.toThrow(ResourceNotFoundError);

    // Sanity: the same project + resource pair succeeds when both actually belong to org A.
    await expect(
      requestResourceAttachment({
        organizationId: orgA.id,
        projectId: projectInOrgA.id,
        resourceKind: 'credential',
        resourceId: credentialInOrgA.id,
        requestedByUserId: owner.id,
        scopeSelection: ['scope-1'],
      }),
    ).resolves.toBeDefined();
  });

  it('an org admin push lands directly as approved, with the pusher recorded as both requester and decider (plan 08 §1.2 "org-admin pushed")', async () => {
    const { owner, organization } = await setupOrgWithOwner('Push Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Pushed Credential',
      provider: 'google_ads',
      availableScopes: ['act_aaa', 'act_bbb'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Pushed-To Project' });

    const attachment = await pushResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      pushedByUserId: owner.id,
      scopeSelection: ['act_aaa'],
    });

    expect(attachment.status).toBe('approved');
    expect(attachment.requested_by).toBe(owner.id);
    expect(attachment.decided_by).toBe(owner.id);
    expect(attachment.decided_at).toBeDefined();
    // No pending step at all — it never shows up in the approval queue.
    expect(await listPendingAttachmentsForOrg(organization.id)).toHaveLength(0);

    const active = await listActiveAttachmentsForProject(organization.id, project.id);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(attachment.id);
    expect(active[0].scope_selection).toEqual(['act_aaa']);
  });

  it('a pushed attachment enforces the same scope-selection and org/project/resource-membership rules as a request', async () => {
    const { owner, organization } = await setupOrgWithOwner('Push Guard Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Narrow Pushed Credential',
      provider: 'meta_ads',
      availableScopes: ['act_only'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Push Guard Project' });
    const { organization: otherOrg } = await setupOrgWithOwner('Other Org');

    await expect(
      pushResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        pushedByUserId: owner.id,
        scopeSelection: ['act_only', 'act_not_granted'],
      }),
    ).rejects.toThrow(InvalidScopeSelectionError);

    await expect(
      pushResourceAttachment({
        organizationId: otherOrg.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        pushedByUserId: owner.id,
        scopeSelection: ['act_only'],
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects deciding or detaching an attachment id that does not exist', async () => {
    const { owner, organization } = await setupOrgWithOwner('Missing Attachment Org');

    await expect(
      decideResourceAttachment({
        organizationId: organization.id,
        attachmentId: 'does-not-exist',
        decidedByUserId: owner.id,
        approve: true,
      }),
    ).rejects.toThrow(AttachmentNotFoundError);

    await expect(
      detachResource({ organizationId: organization.id, attachmentId: 'does-not-exist', actorId: owner.id }),
    ).rejects.toThrow(AttachmentNotFoundError);
  });
});

describe('connection write tier (KAN-74)', () => {
  it('defaults every new attachment to the safe "read" tier', async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Default Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Default Tier Credential',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });

    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });

    expect(request.write_tier).toBe('read');
  });

  it("raises a credential connection's write tier once approved, and records a before/after audit log entry", async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Set Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Manage Tier Credential',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });
    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: request.id, decidedByUserId: owner.id, approve: true });

    const updated = await setResourceAttachmentWriteTier({
      organizationId: organization.id,
      attachmentId: request.id,
      tier: 'optimize',
      actorId: owner.id,
    });

    expect(updated.write_tier).toBe('optimize');
    expect(updated.write_tier_updated_by_user_id).toBe(owner.id);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'resource_attachment.write_tier_change');
    expect(entry).toBeDefined();
    expect(entry?.before).toEqual({ tier: 'read' });
    expect(entry?.after).toEqual({ tier: 'optimize' });
  });

  it('rejects setting a write tier on a template/person attachment (only credentials carry write capability)', async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Non Credential Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Some Rep', createdByUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });
    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'person',
      resourceId: person.id,
      requestedByUserId: owner.id,
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: request.id, decidedByUserId: owner.id, approve: true });

    await expect(
      setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: request.id, tier: 'manage', actorId: owner.id }),
    ).rejects.toThrow(AttachmentNotCredentialError);
  });

  it('rejects setting a write tier on an attachment that is not currently approved', async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Not Approved Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Pending Credential',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });
    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });

    await expect(
      setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: request.id, tier: 'manage', actorId: owner.id }),
    ).rejects.toThrow(AttachmentNotApprovedError);
  });

  it('rejects an invalid tier value', async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Invalid Value Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Some Credential',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Some Project' });
    const request = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: request.id, decidedByUserId: owner.id, approve: true });

    await expect(
      setResourceAttachmentWriteTier({
        organizationId: organization.id,
        attachmentId: request.id,
        // @ts-expect-error deliberately invalid at the type level too, to prove the runtime check catches it
        tier: 'super-manage',
        actorId: owner.id,
      }),
    ).rejects.toThrow(InvalidWriteTierError);
  });

  it('rejects setting a write tier on an attachment id that does not exist', async () => {
    const { owner, organization } = await setupOrgWithOwner('Tier Missing Attachment Org');

    await expect(
      setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: 'does-not-exist', tier: 'manage', actorId: owner.id }),
    ).rejects.toThrow(AttachmentNotFoundError);
  });
});

/**
 * KAN-44 AC ("every config change" is audited) for the resource-attachment
 * lifecycle: which project holds which org credential — and who granted or
 * revoked it — is exactly the org-level config change the audit trail exists
 * to answer for, so every state transition must leave an entry.
 */
describe('resource attachment audit logging (KAN-44)', () => {
  async function setupPendingAttachment(orgName: string) {
    const { owner, organization } = await setupOrgWithOwner(orgName);
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Audited Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_aaa', 'act_bbb'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Audited Project' });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_aaa'],
    });
    return { owner, organization, credential, project, attachment };
  }

  async function entriesFor(organizationId: string, action: string) {
    const entries = await listAuditLogEntriesForOrg(organizationId);
    return entries.filter((entry) => entry.action === action);
  }

  it('records the attach request against the requesting user and target project', async () => {
    const { owner, organization, credential, project, attachment } = await setupPendingAttachment('Attach Request Audit Org');

    const [entry] = await entriesFor(organization.id, 'resource_attachment.request');
    expect(entry).toBeDefined();
    expect(entry.actor_id).toBe(owner.id);
    expect(entry.project_id).toBe(project.id);
    expect(entry.target_type).toBe('resource_attachment');
    expect(entry.target_id).toBe(attachment.id);
    expect(entry.after).toEqual({
      status: 'pending',
      resourceKind: 'credential',
      resourceId: credential.id,
      scopeSelection: ['act_aaa'],
    });
  });

  it('records an approval and a rejection as distinct actions, each with its before/after status', async () => {
    const approved = await setupPendingAttachment('Attach Approve Audit Org');
    await decideResourceAttachment({
      organizationId: approved.organization.id,
      attachmentId: approved.attachment.id,
      decidedByUserId: approved.owner.id,
      approve: true,
    });

    const [approveEntry] = await entriesFor(approved.organization.id, 'resource_attachment.approve');
    expect(approveEntry).toBeDefined();
    expect(approveEntry.actor_id).toBe(approved.owner.id);
    expect(approveEntry.project_id).toBe(approved.project.id);
    expect(approveEntry.before).toEqual({ status: 'pending' });
    expect(approveEntry.after).toEqual({ status: 'approved', scopeSelection: ['act_aaa'] });
    expect(await entriesFor(approved.organization.id, 'resource_attachment.reject')).toHaveLength(0);

    const rejected = await setupPendingAttachment('Attach Reject Audit Org');
    await decideResourceAttachment({
      organizationId: rejected.organization.id,
      attachmentId: rejected.attachment.id,
      decidedByUserId: rejected.owner.id,
      approve: false,
    });

    const [rejectEntry] = await entriesFor(rejected.organization.id, 'resource_attachment.reject');
    expect(rejectEntry).toBeDefined();
    expect(rejectEntry.after).toEqual({ status: 'rejected', scopeSelection: ['act_aaa'] });
    expect(await entriesFor(rejected.organization.id, 'resource_attachment.approve')).toHaveLength(0);
  });

  it('records a push as its own action, distinct from a request, against the pushing admin', async () => {
    const { owner, organization } = await setupOrgWithOwner('Push Audit Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Audited Pushed Credential',
      provider: 'meta_ads',
      availableScopes: ['act_aaa'],
      createdByUserId: owner.id,
    });
    const { project } = await createProject({ organizationId: organization.id, name: 'Audited Pushed Project' });

    const attachment = await pushResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      pushedByUserId: owner.id,
      scopeSelection: ['act_aaa'],
    });

    const [pushEntry] = await entriesFor(organization.id, 'resource_attachment.push');
    expect(pushEntry).toBeDefined();
    expect(pushEntry.actor_id).toBe(owner.id);
    expect(pushEntry.project_id).toBe(project.id);
    expect(pushEntry.target_id).toBe(attachment.id);
    expect(pushEntry.after).toEqual({
      status: 'approved',
      resourceKind: 'credential',
      resourceId: credential.id,
      scopeSelection: ['act_aaa'],
    });
    expect(await entriesFor(organization.id, 'resource_attachment.request')).toHaveLength(0);

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });

  it('records the detach against the revoking admin, and keeps the whole lifecycle chain verifiable', async () => {
    const { owner, organization, project, attachment } = await setupPendingAttachment('Attach Detach Audit Org');
    await decideResourceAttachment({
      organizationId: organization.id,
      attachmentId: attachment.id,
      decidedByUserId: owner.id,
      approve: true,
    });

    const revoker = await ensureUserForFirebaseSession({
      firebaseUid: unique('firebase-uid'),
      email: uniqueEmail('revoker'),
    });
    await detachResource({ organizationId: organization.id, attachmentId: attachment.id, actorId: revoker.id });

    const [detachEntry] = await entriesFor(organization.id, 'resource_attachment.detach');
    expect(detachEntry).toBeDefined();
    // The detacher is not the requester — the audit trail must attribute the
    // revocation to whoever actually performed it.
    expect(detachEntry.actor_id).toBe(revoker.id);
    expect(detachEntry.project_id).toBe(project.id);
    expect(detachEntry.before).toEqual({ status: 'approved', scopeSelection: ['act_aaa'] });
    expect(detachEntry.after).toEqual({ status: 'detached' });

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });

  it('records nothing when a transition is rejected by its own guard', async () => {
    const { organization, attachment } = await setupPendingAttachment('Attach Guard Audit Org');

    // Still `pending`, so detaching must fail — and a failed transition is not
    // a config change to record.
    await expect(
      detachResource({ organizationId: organization.id, attachmentId: attachment.id, actorId: 'someone' }),
    ).rejects.toThrow(AttachmentNotApprovedError);

    expect(await entriesFor(organization.id, 'resource_attachment.detach')).toHaveLength(0);
  });
});

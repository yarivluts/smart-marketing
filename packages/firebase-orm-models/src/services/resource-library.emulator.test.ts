import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AttachmentNotApprovedError,
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
  listActiveAttachmentsForProject,
  listAttachmentsForProject,
  listOrgPeople,
  listPendingAttachmentsForOrg,
  listResourceTemplates,
  listSharedCredentials,
  ProjectNotFoundError,
  requestResourceAttachment,
  ResourceAttachmentModel,
  ResourceNotFoundError,
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

    await detachResource({ organizationId: organization.id, attachmentId: requestA.id });

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

    await expect(detachResource({ organizationId: organization.id, attachmentId: request.id })).rejects.toThrow(
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
      detachResource({ organizationId: organization.id, attachmentId: 'does-not-exist' }),
    ).rejects.toThrow(AttachmentNotFoundError);
  });
});

import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  archiveOrgPerson,
  archiveResourceTemplate,
  archiveSharedCredential,
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
  ResourceArchivedError,
  ResourceAttachmentModel,
  ResourceNotFoundError,
  setResourceAttachmentWriteTier,
  unarchiveOrgPerson,
  unarchiveResourceTemplate,
  unarchiveSharedCredential,
  updateOrgPerson,
  updateResourceTemplate,
  updateSharedCredential,
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

describe('updateOrgPerson (KAN-100)', () => {
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

describe('updateResourceTemplate (KAN-117)', () => {
  it("updates a template's name and config, bumping version, persisted for a later list", async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Update Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Standard SaaS Funnel',
      type: 'metric_definition',
      config: { steps: ['signup', 'activation'] },
      createdByUserId: owner.id,
    });
    expect(template.version).toBe(1);

    const updated = await updateResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      name: 'Standard SaaS Funnel v2',
      config: { steps: ['signup', 'activation', 'conversion'] },
      actorId: owner.id,
    });

    expect(updated.name).toBe('Standard SaaS Funnel v2');
    expect(updated.version).toBe(2);
    expect(updated.config).toEqual({ steps: ['signup', 'activation', 'conversion'] });

    const [reloaded] = (await listResourceTemplates(organization.id)).filter((t) => t.id === template.id);
    expect(reloaded.name).toBe('Standard SaaS Funnel v2');
    expect(reloaded.version).toBe(2);
  });

  it('clears config when omitted, without touching the name', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Clear Config Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Full Config Template',
      type: 'dashboard',
      config: { widgets: 3 },
      createdByUserId: owner.id,
    });

    const updated = await updateResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      name: 'Full Config Template',
      actorId: owner.id,
    });

    expect(updated.name).toBe('Full Config Template');
    expect(updated.version).toBe(2);
    expect(updated.config).toBeNull();

    // Reload from Firestore rather than trusting the returned in-memory object alone: this is the
    // exact bug class `HookEndpointModel.disabled_at`'s own doc comment warns about — `updateDoc()`
    // drops an `undefined` field instead of clearing it, so a fix that merely sets `config =
    // undefined` in memory would pass the assertions above while leaving the old config persisted.
    const [reloaded] = (await listResourceTemplates(organization.id)).filter((t) => t.id === template.id);
    expect(reloaded.config).toBeFalsy();
  });

  it('increments version by exactly one per edit across repeated edits', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Repeat Edit Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Repeat Edit Template',
      type: 'schema',
      createdByUserId: owner.id,
    });

    await updateResourceTemplate({ organizationId: organization.id, templateId: template.id, name: 'Repeat Edit Template v2', actorId: owner.id });
    const twice = await updateResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      name: 'Repeat Edit Template v3',
      actorId: owner.id,
    });

    expect(twice.version).toBe(3);
  });

  it('rejects updating a template id that does not exist', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Missing Org');
    await expect(
      updateResourceTemplate({ organizationId: organization.id, templateId: 'does-not-exist', name: 'X', actorId: owner.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it("rejects updating another org's template, even with a real template id (isolation)", async () => {
    const { owner: ownerA, organization: orgA } = await setupOrgWithOwner('Template Isolation Org A');
    const { owner: ownerB, organization: orgB } = await setupOrgWithOwner('Template Isolation Org B');
    const templateInA = await createResourceTemplate({ organizationId: orgA.id, name: 'Org A Template', type: 'schema', createdByUserId: ownerA.id });

    await expect(
      updateResourceTemplate({ organizationId: orgB.id, templateId: templateInA.id, name: 'Hijacked', actorId: ownerB.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('records an audit log entry with before/after values, keeping the org audit-log chain valid', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Audit Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Before Template',
      type: 'guardrail_policy',
      createdByUserId: owner.id,
    });

    await updateResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      name: 'After Template',
      config: { max_regression_pct: 20 },
      actorId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const [entry] = entries.filter((e) => e.action === 'resource_template.update');
    expect(entry).toBeDefined();
    expect(entry.actor_id).toBe(owner.id);
    expect(entry.target_type).toBe('resource_template');
    expect(entry.target_id).toBe(template.id);
    expect(entry.before).toEqual({ name: 'Before Template', version: 1, config: null });
    expect(entry.after).toEqual({ name: 'After Template', version: 2, config: { max_regression_pct: 20 } });

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });
});

describe('updateSharedCredential (KAN-119)', () => {
  it("updates a credential's name and available scopes, persisted for a later list, without touching provider", async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Update Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });

    const updated = await updateSharedCredential({
      organizationId: organization.id,
      credentialId: credential.id,
      name: 'Agency Meta MCC (renamed)',
      availableScopes: ['act_1', 'act_2'],
      actorId: owner.id,
    });

    expect(updated.name).toBe('Agency Meta MCC (renamed)');
    expect(updated.provider).toBe('meta_ads');
    expect(updated.available_scopes).toEqual(['act_1', 'act_2']);

    // Reload from Firestore rather than trusting the returned in-memory object alone — the exact
    // bug class `HookEndpointModel.disabled_at`'s/`updateResourceTemplate`'s own doc comments warn
    // about: `updateDoc()` drops an `undefined` field instead of clearing it, so a fix that merely
    // sets a field in memory would pass an in-memory-only assertion while leaving Firestore stale.
    const [reloaded] = (await listSharedCredentials(organization.id)).filter((c) => c.id === credential.id);
    expect(reloaded.name).toBe('Agency Meta MCC (renamed)');
    expect(reloaded.available_scopes).toEqual(['act_1', 'act_2']);
  });

  it('replaces the scope list wholesale, clearing to an empty array when none are sent, persisted in Firestore', async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Clear Scopes Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Full Scopes Credential',
      provider: 'google_ads',
      availableScopes: ['act_1', 'act_2'],
      createdByUserId: owner.id,
    });

    await updateSharedCredential({
      organizationId: organization.id,
      credentialId: credential.id,
      name: 'Full Scopes Credential',
      availableScopes: [],
      actorId: owner.id,
    });

    const [reloaded] = (await listSharedCredentials(organization.id)).filter((c) => c.id === credential.id);
    expect(reloaded.available_scopes).toEqual([]);
  });

  it('rejects updating a credential id that does not exist', async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Missing Org');
    await expect(
      updateSharedCredential({
        organizationId: organization.id,
        credentialId: 'does-not-exist',
        name: 'X',
        availableScopes: [],
        actorId: owner.id,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it("rejects updating another org's credential, even with a real credential id (isolation)", async () => {
    const { owner: ownerA, organization: orgA } = await setupOrgWithOwner('Credential Isolation Org A');
    const { owner: ownerB, organization: orgB } = await setupOrgWithOwner('Credential Isolation Org B');
    const credentialInA = await createSharedCredential({
      organizationId: orgA.id,
      name: 'Org A Credential',
      provider: 'generic',
      availableScopes: [],
      createdByUserId: ownerA.id,
    });

    await expect(
      updateSharedCredential({
        organizationId: orgB.id,
        credentialId: credentialInA.id,
        name: 'Hijacked',
        availableScopes: [],
        actorId: ownerB.id,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('records an audit log entry with before/after values, keeping the org audit-log chain valid', async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Audit Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Before Credential',
      provider: 'stripe',
      availableScopes: ['acct_1'],
      createdByUserId: owner.id,
    });

    await updateSharedCredential({
      organizationId: organization.id,
      credentialId: credential.id,
      name: 'After Credential',
      availableScopes: ['acct_1', 'acct_2'],
      actorId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const [entry] = entries.filter((e) => e.action === 'shared_credential.update');
    expect(entry).toBeDefined();
    expect(entry.actor_id).toBe(owner.id);
    expect(entry.target_type).toBe('shared_credential');
    expect(entry.target_id).toBe(credential.id);
    expect(entry.before).toEqual({ name: 'Before Credential', availableScopes: ['acct_1'] });
    expect(entry.after).toEqual({ name: 'After Credential', availableScopes: ['acct_1', 'acct_2'] });

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });
});

describe('archive / unarchive (KAN-129)', () => {
  it('archives and unarchives a shared credential, persisted for a later list, without touching name/provider/scopes', async () => {
    const { owner, organization } = await setupOrgWithOwner('Credential Archive Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Google MCC',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });

    const archived = await archiveSharedCredential({
      organizationId: organization.id,
      credentialId: credential.id,
      archivedByUserId: owner.id,
    });
    expect(archived.archived_at).toBeTruthy();
    expect(archived.archived_by).toBe(owner.id);
    expect(archived.name).toBe('Agency Google MCC');
    expect(archived.available_scopes).toEqual(['act_1']);

    let [reloaded] = (await listSharedCredentials(organization.id)).filter((c) => c.id === credential.id);
    expect(reloaded.archived_at).toBeTruthy();

    const unarchived = await unarchiveSharedCredential({
      organizationId: organization.id,
      credentialId: credential.id,
      unarchivedByUserId: owner.id,
    });
    expect(unarchived.archived_at).toBeFalsy();
    expect(unarchived.archived_by).toBeFalsy();

    [reloaded] = (await listSharedCredentials(organization.id)).filter((c) => c.id === credential.id);
    expect(reloaded.archived_at).toBeFalsy();
  });

  it('archives and unarchives a resource template, without touching name/type/config/version', async () => {
    const { owner, organization } = await setupOrgWithOwner('Template Archive Org');
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Standard MRR Dashboard',
      type: 'dashboard',
      config: { layout: 'grid' },
      createdByUserId: owner.id,
    });

    const archived = await archiveResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      archivedByUserId: owner.id,
    });
    expect(archived.archived_at).toBeTruthy();
    expect(archived.version).toBe(1);
    expect(archived.config).toEqual({ layout: 'grid' });

    const unarchived = await unarchiveResourceTemplate({
      organizationId: organization.id,
      templateId: template.id,
      unarchivedByUserId: owner.id,
    });
    expect(unarchived.archived_at).toBeFalsy();
    expect(unarchived.archived_by).toBeFalsy();
  });

  it('archives and unarchives an org person, without touching name/email/title', async () => {
    const { owner, organization } = await setupOrgWithOwner('Person Archive Org');
    const person = await createOrgPerson({
      organizationId: organization.id,
      name: 'Departed Rep',
      email: uniqueEmail('departed'),
      title: 'Account Manager',
      createdByUserId: owner.id,
    });

    const archived = await archiveOrgPerson({
      organizationId: organization.id,
      personId: person.id,
      archivedByUserId: owner.id,
    });
    expect(archived.archived_at).toBeTruthy();
    expect(archived.archived_by).toBe(owner.id);
    expect(archived.name).toBe('Departed Rep');

    const [reloaded] = (await listOrgPeople(organization.id)).filter((p) => p.id === person.id);
    expect(reloaded.archived_at).toBeTruthy();
    expect(reloaded.name).toBe('Departed Rep');

    const unarchived = await unarchiveOrgPerson({
      organizationId: organization.id,
      personId: person.id,
      unarchivedByUserId: owner.id,
    });
    expect(unarchived.archived_at).toBeFalsy();
    expect(unarchived.archived_by).toBeFalsy();
  });

  it('is idempotent: re-archiving an already-archived resource just refreshes archived_at/archived_by', async () => {
    const { owner, organization } = await setupOrgWithOwner('Idempotent Archive Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Repeat Archive Rep', createdByUserId: owner.id });

    await archiveOrgPerson({ organizationId: organization.id, personId: person.id, archivedByUserId: owner.id });
    const secondActor = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('second-actor') });
    const twice = await archiveOrgPerson({ organizationId: organization.id, personId: person.id, archivedByUserId: secondActor.id });

    expect(twice.archived_at).toBeTruthy();
    expect(twice.archived_by).toBe(secondActor.id);
  });

  it('is idempotent: unarchiving an already-active resource is a no-op that still succeeds', async () => {
    const { owner, organization } = await setupOrgWithOwner('Idempotent Unarchive Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Never Archived Rep', createdByUserId: owner.id });

    const unarchived = await unarchiveOrgPerson({ organizationId: organization.id, personId: person.id, unarchivedByUserId: owner.id });
    expect(unarchived.archived_at).toBeFalsy();
  });

  it('rejects archiving/unarchiving a resource id that does not exist, for every kind', async () => {
    const { owner, organization } = await setupOrgWithOwner('Archive Missing Org');
    await expect(
      archiveOrgPerson({ organizationId: organization.id, personId: 'does-not-exist', archivedByUserId: owner.id }),
    ).rejects.toThrow(ResourceNotFoundError);
    await expect(
      archiveResourceTemplate({ organizationId: organization.id, templateId: 'does-not-exist', archivedByUserId: owner.id }),
    ).rejects.toThrow(ResourceNotFoundError);
    await expect(
      archiveSharedCredential({ organizationId: organization.id, credentialId: 'does-not-exist', archivedByUserId: owner.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it("rejects archiving another org's person, even with a real person id (isolation)", async () => {
    const { owner: ownerA, organization: orgA } = await setupOrgWithOwner('Archive Isolation Org A');
    const { owner: ownerB, organization: orgB } = await setupOrgWithOwner('Archive Isolation Org B');
    const personInA = await createOrgPerson({ organizationId: orgA.id, name: 'Org A Rep', createdByUserId: ownerA.id });

    await expect(
      archiveOrgPerson({ organizationId: orgB.id, personId: personInA.id, archivedByUserId: ownerB.id }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('records archive/unarchive audit log entries, keeping the org audit-log chain valid', async () => {
    const { owner, organization } = await setupOrgWithOwner('Archive Audit Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Audited Rep', createdByUserId: owner.id });

    await archiveOrgPerson({ organizationId: organization.id, personId: person.id, archivedByUserId: owner.id });
    await unarchiveOrgPerson({ organizationId: organization.id, personId: person.id, unarchivedByUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((e) => e.action === 'org_person.archive' && e.target_id === person.id)).toBe(true);
    expect(entries.some((e) => e.action === 'org_person.unarchive' && e.target_id === person.id)).toBe(true);

    await expect(verifyAuditLogChainForOrg(organization.id)).resolves.toMatchObject({ valid: true });
  });

  it('rejects a new attachment request/push for an archived resource of every kind, but leaves an already-approved attachment untouched', async () => {
    const { owner, organization } = await setupOrgWithOwner('Archive Attach Org');
    const { project } = await createProject({ organizationId: organization.id, name: 'Archive Attach Project' });
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Attach Rep', createdByUserId: owner.id });
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Attach Template',
      type: 'dashboard',
      createdByUserId: owner.id,
    });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Attach Credential',
      provider: 'generic',
      availableScopes: ['scope_a'],
      createdByUserId: owner.id,
    });

    // An already-approved attachment survives archiving the resource it points at.
    const approvedAttachment = await pushResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'person',
      resourceId: person.id,
      pushedByUserId: owner.id,
    });
    await archiveOrgPerson({ organizationId: organization.id, personId: person.id, archivedByUserId: owner.id });
    const stillActive = await listActiveAttachmentsForProject(organization.id, project.id);
    expect(stillActive.some((a) => a.id === approvedAttachment.id)).toBe(true);

    // But no *new* attachment can be requested or pushed for any archived resource kind.
    await expect(
      requestResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'person',
        resourceId: person.id,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(ResourceArchivedError);

    await archiveResourceTemplate({ organizationId: organization.id, templateId: template.id, archivedByUserId: owner.id });
    await expect(
      pushResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'template',
        resourceId: template.id,
        pushedByUserId: owner.id,
      }),
    ).rejects.toThrow(ResourceArchivedError);

    await archiveSharedCredential({ organizationId: organization.id, credentialId: credential.id, archivedByUserId: owner.id });
    await expect(
      requestResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        requestedByUserId: owner.id,
        scopeSelection: ['scope_a'],
      }),
    ).rejects.toThrow(ResourceArchivedError);

    // Unarchiving restores the ability to start a new attachment.
    await unarchiveSharedCredential({ organizationId: organization.id, credentialId: credential.id, unarchivedByUserId: owner.id });
    await expect(
      requestResourceAttachment({
        organizationId: organization.id,
        projectId: project.id,
        resourceKind: 'credential',
        resourceId: credential.id,
        requestedByUserId: owner.id,
        scopeSelection: ['scope_a'],
      }),
    ).resolves.toBeInstanceOf(ResourceAttachmentModel);
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

    // A later org-admin edit (KAN-117's `updateResourceTemplate`, the real
    // edit surface `ResourceTemplateModel`'s own doc comment always
    // described) bumps the template to v2 — confirm the already-recorded
    // pin doesn't silently follow it.
    await updateResourceTemplate({ organizationId: organization.id, templateId: template.id, name: template.name, actorId: owner.id });

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

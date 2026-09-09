import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  archiveProject,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  InvalidProjectCurrencyError,
  InvalidProjectTimezoneError,
  listAuditLogEntriesForOrg,
  listOrgProjects,
  ProjectModel,
  unarchiveProject,
  updateProjectDetails,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for the EasySign-audit project work: declared currency/timezone (J-03) and archive (J-06). */

beforeAll(async () => {
  await connectToFirestoreEmulator('project-settings-audit-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupOrgProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'EasySign Growth' });
  return { owner, organization, project };
}

describe('updateProjectDetails currency + timezone', () => {
  it('stores an ISO-4217 code (upper-cased) and an IANA zone, leaves them untouched when omitted, and clears on empty string', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Currency Org');

    const updated = await updateProjectDetails({
      organizationId: organization.id,
      projectId: project.id,
      name: project.name,
      currency: 'ils',
      timezone: 'Asia/Jerusalem',
      actorUserId: owner.id,
    });
    expect(updated.currency).toBe('ILS');
    expect(updated.timezone).toBe('Asia/Jerusalem');

    const untouched = await updateProjectDetails({ organizationId: organization.id, projectId: project.id, name: 'Renamed', actorUserId: owner.id });
    expect(untouched.currency).toBe('ILS');
    expect(untouched.timezone).toBe('Asia/Jerusalem');

    const cleared = await updateProjectDetails({ organizationId: organization.id, projectId: project.id, name: 'Renamed', currency: '', timezone: '', actorUserId: owner.id });
    expect(cleared.currency).toBe('');
    expect(cleared.timezone).toBe('');
  });

  it('rejects a malformed currency code and an unknown time zone', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Currency Invalid Org');
    await expect(
      updateProjectDetails({ organizationId: organization.id, projectId: project.id, name: project.name, currency: 'shekels', actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidProjectCurrencyError);
    await expect(
      updateProjectDetails({ organizationId: organization.id, projectId: project.id, name: project.name, timezone: 'Middle/Nowhere', actorUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidProjectTimezoneError);
  });
});

describe('archiveProject / unarchiveProject', () => {
  it('hides an archived project from listOrgProjects (unless includeArchived), keeps it on record, audits both directions, and is idempotent', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Archive Org');
    const { project: sibling } = await createProject({ organizationId: organization.id, name: 'EasySign Ads Attribution' });

    const archived = await archiveProject(organization.id, sibling.id, owner.id);
    expect(archived.archived_at).toEqual(expect.any(String));

    const live = await listOrgProjects(organization.id);
    expect(live.map((candidate) => candidate.id)).toEqual([project.id]);
    const all = await listOrgProjects(organization.id, { includeArchived: true });
    expect(all.map((candidate) => candidate.id).sort()).toEqual([project.id, sibling.id].sort());

    const reloaded = await ProjectModel.init(sibling.id, { organization_id: organization.id });
    expect(reloaded?.name).toBe('EasySign Ads Attribution');

    // Idempotent: archiving twice does not re-stamp or re-audit.
    const again = await archiveProject(organization.id, sibling.id, owner.id);
    expect(again.archived_at).toBe(archived.archived_at);

    const restored = await unarchiveProject(organization.id, sibling.id, owner.id);
    expect(restored.archived_at ?? null).toBeNull();
    const liveAgain = await listOrgProjects(organization.id);
    expect(liveAgain.map((candidate) => candidate.id).sort()).toEqual([project.id, sibling.id].sort());

    const audit = await listAuditLogEntriesForOrg(organization.id);
    expect(audit.filter((entry) => entry.action === 'project.archive')).toHaveLength(1);
    expect(audit.filter((entry) => entry.action === 'project.unarchive')).toHaveLength(1);
  });
});

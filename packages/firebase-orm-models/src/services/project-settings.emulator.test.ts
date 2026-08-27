import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  InvalidProjectNameError,
  listAuditLogEntriesForOrg,
  ProjectModel,
  ProjectNotFoundError,
  updateProjectDetails,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for `updateProjectDetails` — correcting a project's
 * own `name`/`vertical` once created, closing the same "create + list
 * only, no way to fix a typo'd definition" gap KAN-100/117/119/120/121
 * already closed for their own sibling registries.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('project-settings-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Original Project', vertical: 'ecommerce' });
  return { owner, organization, project };
}

describe('updateProjectDetails', () => {
  it('replaces name and vertical — persisted to Firestore', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Update Org');

    const updated = await updateProjectDetails({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Updated Project Name',
      vertical: 'fintech',
      actorUserId: owner.id,
    });

    expect(updated.name).toBe('Updated Project Name');
    expect(updated.vertical).toBe('fintech');
    expect(updated.id).toBe(project.id);
    expect(updated.organization_id).toBe(organization.id);

    const reloaded = await ProjectModel.init(project.id, { organization_id: organization.id });
    expect(reloaded?.name).toBe('Updated Project Name');
    expect(reloaded?.vertical).toBe('fintech');
  });

  it('clears vertical when given an empty string, rather than leaving the old value', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Update Clear Org');

    const cleared = await updateProjectDetails({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Original Project',
      vertical: '',
      actorUserId: owner.id,
    });
    expect(cleared.vertical).toBe('');

    const reloaded = await ProjectModel.init(project.id, { organization_id: organization.id });
    expect(reloaded?.vertical).toBe('');
  });

  it('rejects a blank name without persisting any change', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Update Blank Name Org');

    await expect(
      updateProjectDetails({
        organizationId: organization.id,
        projectId: project.id,
        name: '   ',
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidProjectNameError);

    const reloaded = await ProjectModel.init(project.id, { organization_id: organization.id });
    expect(reloaded?.name).toBe('Original Project');
  });

  it('rejects a project that does not exist in this organization', async () => {
    const { owner, organization } = await setupOrgProject('Project Update Missing Org');

    await expect(
      updateProjectDetails({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        name: 'x',
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('rejects a project that belongs to a different organization', async () => {
    const { organization: otherOrg } = await setupOrgProject('Project Update Other Org');
    const { owner, project } = await setupOrgProject('Project Update Wrong Org');

    await expect(
      updateProjectDetails({
        organizationId: otherOrg.id,
        projectId: project.id,
        name: 'x',
        actorUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('records an audit log entry with before/after values', async () => {
    const { owner, organization, project } = await setupOrgProject('Project Update Audit Org');

    const updated = await updateProjectDetails({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Renamed Project',
      vertical: 'fintech',
      actorUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const updateEntry = entries.find((entry) => entry.action === 'project.update' && entry.target_id === project.id);
    expect(updateEntry).toBeTruthy();
    expect(updateEntry?.actor_id).toBe(owner.id);
    expect(updateEntry?.before).toEqual({ name: 'Original Project', vertical: 'ecommerce' });
    expect(updateEntry?.after).toEqual({ name: 'Renamed Project', vertical: updated.vertical });
  });
});

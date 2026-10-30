import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createFieldMapping,
  createProject,
  disableFieldMapping,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, ownerSession, organization, project, prodEnvironment };
}

const VALID_EVENT_RULES = [
  { targetField: 'event_id', transform: 'rename' as const, sourcePath: 'id' },
  { targetField: 'event', transform: 'static' as const, staticValue: 'order_completed' },
  { targetField: 'ts', transform: 'rename' as const, sourcePath: 'created_at' },
];

describe('POST /api/orgs/[orgId]/projects/[projectId]/field-mappings/[fieldMappingId]/enable', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', fieldMappingId: 'mapping-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a mapping that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Field Mapping Enable Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, fieldMappingId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });

  it('re-enables a disabled mapping', async () => {
    const { owner, ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Enable Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: [{ name: 'order_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    const mapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'X',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });
    await disableFieldMapping({ organizationId: organization.id, projectId: project.id, fieldMappingId: mapping.id, disabledByUserId: owner.id });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, fieldMappingId: mapping.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'enabled' });
  });

  it('lets a project-scoped project_admin re-enable on their bound project but returns 403 on a sibling project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Enable Project Admin Org');
    const { project: siblingProject, environments: siblingEnvs } = await createProject({ organizationId: organization.id, name: 'Sibling' });
    const siblingProd = siblingEnvs.find((e) => e.name === 'prod')!;

    for (const p of [project, siblingProject]) {
      await registerSchemaDefinition({
        organizationId: organization.id,
        projectId: p.id,
        kind: 'event',
        name: 'order_completed',
        fields: [{ name: 'order_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
        createdByUserId: owner.id,
      });
    }

    const mapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'X',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });
    await disableFieldMapping({ organizationId: organization.id, projectId: project.id, fieldMappingId: mapping.id, disabledByUserId: owner.id });

    const siblingMapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: siblingProject.id,
      environmentId: siblingProd.id,
      name: 'Y',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });
    await disableFieldMapping({ organizationId: organization.id, projectId: siblingProject.id, fieldMappingId: siblingMapping.id, disabledByUserId: owner.id });

    const adminEmail = uniqueEmail('fm-enable-project-admin');
    const invite = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: adminEmail,
      role: 'project_admin',
      invitedByUserId: owner.id,
      projectId: project.id,
    });
    const adminSession = await sessionFor(unique('uid'), adminEmail);
    const adminUser = await ensureUserForFirebaseSession({ firebaseUid: adminSession.uid, email: adminEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invite.id, userId: adminUser.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(adminSession);

    const allowed = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, fieldMappingId: mapping.id }),
    });
    expect(allowed.status).toBe(200);

    const blocked = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: siblingProject.id, fieldMappingId: siblingMapping.id }),
    });
    expect(blocked.status).toBe(403);
  });
});

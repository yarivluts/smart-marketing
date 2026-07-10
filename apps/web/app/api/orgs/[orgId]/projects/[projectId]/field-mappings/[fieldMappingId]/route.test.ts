import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createFieldMapping, createProject, ensureUserForFirebaseSession, registerSchemaDefinition } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE } from './route';

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

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/field-mappings/[fieldMappingId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', fieldMappingId: 'mapping-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a mapping that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Field Mapping Disable Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, fieldMappingId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });

  it('disables an existing mapping', async () => {
    const { owner, ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Field Mapping Disable Org');
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

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, fieldMappingId: mapping.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'disabled' });
  });
});

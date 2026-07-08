import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { disablePlugin, installPlugin, registerPluginManifest } from '@/lib/orgs/mutations';
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

const VALID_MANIFEST_YAML = `
id: com.example.shopify-pack
version: 1.0.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]
`;

async function setupDisabledPlugin(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerPluginManifest({ organizationId: organization.id, manifestYaml: VALID_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: 'com.example.shopify-pack',
    version: '1.0.0',
    consentedScopes: ['ingest:write', 'schema:write'],
    config: {},
    installedByUserId: owner.id,
  });
  await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
  return { ownerSession, organization, project, install };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/plugins/[installId]/enable', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', installId: 'install-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('re-enables a disabled install', async () => {
    const { ownerSession, organization, project, install } = await setupDisabledPlugin('Plugin Enable Route Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { install: { status: string } };
    expect(body.install.status).toBe('installed');
  });

  it('returns 409 when enabling an install that is not currently disabled', async () => {
    const { ownerSession, organization, project, install } = await setupDisabledPlugin('Plugin Enable Route Twice Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    const response = await POST(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(409);
  });
});

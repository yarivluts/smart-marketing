import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getLatestPluginManifestVersion,
  LANDING_PAGE_PACK_PLUGIN_ID,
  listBoardsForProject,
  listMetricDefinitionsForProject,
  SAAS_METRIC_PACK_PLUGIN_ID,
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
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

function builtinInstallRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins/builtin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/plugins/builtin', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = builtinInstallRequest('org-1', 'project-1', { pluginId: SAAS_METRIC_PACK_PLUGIN_ID });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a missing pluginId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Builtin Install Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = builtinInstallRequest(organization.id, project.id, {});
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('rejects an unknown plugin id rather than silently no-op-ing', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Builtin Install Route Unknown Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = builtinInstallRequest(organization.id, project.id, { pluginId: 'com.example.not-a-real-pack' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unknown_plugin_id' });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Builtin Install Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = builtinInstallRequest(organization.id, 'does-not-exist-project', { pluginId: SAAS_METRIC_PACK_PLUGIN_ID });
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('installs a built-in pack end to end with no manifest pre-registered — no YAML pasted by the caller', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Builtin Install Route Success Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    expect(await getLatestPluginManifestVersion(organization.id, LANDING_PAGE_PACK_PLUGIN_ID)).toBeNull();

    const { request, params } = builtinInstallRequest(organization.id, project.id, { pluginId: LANDING_PAGE_PACK_PLUGIN_ID });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { install: { pluginId: string; status: string } };
    expect(body.install.pluginId).toBe(LANDING_PAGE_PACK_PLUGIN_ID);
    expect(body.install.status).toBe('installed');

    expect(await getLatestPluginManifestVersion(organization.id, LANDING_PAGE_PACK_PLUGIN_ID)).not.toBeNull();
    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.map((def) => def.name).sort()).toEqual(['lp_conversion_rate', 'lp_conversions', 'lp_visitors']);
    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name)).toEqual(['Landing page performance']);
  });

  it('returns 409 for a pack already actively installed in this project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Builtin Install Route Conflict Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = builtinInstallRequest(organization.id, project.id, { pluginId: SAAS_METRIC_PACK_PLUGIN_ID });
    expect((await POST(first.request, { params: first.params })).status).toBe(201);

    const second = builtinInstallRequest(organization.id, project.id, { pluginId: SAAS_METRIC_PACK_PLUGIN_ID });
    const response = await POST(second.request, { params: second.params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already_installed' });
  });
});

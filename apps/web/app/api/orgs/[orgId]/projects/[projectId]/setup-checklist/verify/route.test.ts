import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const { requireOrgPermissionMock, updateProjectDetailsMock, ensurePluginInstallMock, disablePluginInstallByPluginIdMock, listOrgProjectsMock } = vi.hoisted(() => ({
  requireOrgPermissionMock: vi.fn(),
  updateProjectDetailsMock: vi.fn(),
  ensurePluginInstallMock: vi.fn(),
  disablePluginInstallByPluginIdMock: vi.fn(),
  listOrgProjectsMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock('@/lib/orgs/mutations', () => ({
  updateProjectDetails: updateProjectDetailsMock,
  ensurePluginInstall: ensurePluginInstallMock,
  disablePluginInstallByPluginId: disablePluginInstallByPluginIdMock,
}));

vi.mock('@/lib/orgs/queries', () => ({
  listOrgProjects: listOrgProjectsMock,
}));

vi.mock('@/lib/firebase/firestore', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
  ingestBatch: vi.fn().mockResolvedValue({
    batchId: 'batch_verify_123',
    accepted: 1,
    quarantined: 0,
    total: 1,
    duplicates: 0,
    kind: 'event',
  }),
  listEnvironmentsForProject: vi.fn().mockResolvedValue([{ id: 'env_prod', name: 'Production' }]),
  ProjectNotFoundError: class ProjectNotFoundError extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireOrgPermissionMock.mockResolvedValue({ user: { id: 'user_1' } });
  listOrgProjectsMock.mockResolvedValue([
    {
      id: 'prj_1',
      name: 'Test Project',
      vertical: 'saas_subscription',
      platform_type: 'web',
      business_model: 'saas_subscription',
      transaction_type: 'monthly_recurring',
      primary_stack: 'stripe',
      verified_requirements: ['req_web_sdk'],
      custom_hidden_modules: [],
    },
  ]);
  updateProjectDetailsMock.mockResolvedValue(undefined);
  ensurePluginInstallMock.mockResolvedValue({ id: 'install_1' });
  disablePluginInstallByPluginIdMock.mockResolvedValue(true);
});

function verifyRequest(
  orgId: string,
  projectId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/setup-checklist/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/setup-checklist/verify', () => {
  it('returns 400 if requirementId is missing', async () => {
    const { request, params } = verifyRequest('org_1', 'prj_1', { action: 'verify' });
    const res = await POST(request, { params });
    expect(res.status).toBe(400);
  });

  it('verifies requirement, ingests synthetic batch, installs connector, and updates project', async () => {
    const { request, params } = verifyRequest('org_1', 'prj_1', {
      requirementId: 'req_stripe_billing',
      action: 'verify',
    });

    const res = await POST(request, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verified).toBe(true);
    expect(data.verifiedRequirements).toContain('req_web_sdk');
    expect(data.verifiedRequirements).toContain('req_stripe_billing');
    expect(data.testResult).toBeDefined();
    expect(data.testResult.status).toBe('success');
    expect(data.testResult.connectorId).toBe('stripe');

    expect(ensurePluginInstallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        projectId: 'prj_1',
        pluginId: 'stripe',
      }),
    );
    expect(updateProjectDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedRequirements: expect.arrayContaining(['req_web_sdk', 'req_stripe_billing']),
      }),
    );
  });

  it('unverifies requirement, disables plugin, and updates project', async () => {
    const { request, params } = verifyRequest('org_1', 'prj_1', {
      requirementId: 'req_web_sdk',
      action: 'unverify',
    });

    const res = await POST(request, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verified).toBe(false);
    expect(data.verifiedRequirements).not.toContain('req_web_sdk');

    expect(disablePluginInstallByPluginIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        projectId: 'prj_1',
        pluginId: 'growthos_sdk',
      }),
    );
  });

  it('rejects unauthenticated or unauthorized users', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });

    const { request, params } = verifyRequest('org_1', 'prj_1', {
      requirementId: 'req_web_sdk',
    });

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
  });
});

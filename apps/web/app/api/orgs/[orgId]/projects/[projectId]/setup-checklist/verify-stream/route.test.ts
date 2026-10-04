import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const { requireOrgPermissionMock, verifyStreamForRequirementMock } = vi.hoisted(() => ({
  requireOrgPermissionMock: vi.fn(),
  verifyStreamForRequirementMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock('@/lib/projects/setup-stream-verifier', () => ({
  verifyStreamForRequirement: verifyStreamForRequirementMock,
  STREAM_REQUIREMENT_MATCHERS: {
    req_web_sdk: { requirementId: 'req_web_sdk' },
    req_checkout_stream: { requirementId: 'req_checkout_stream' },
  },
}));

describe('Setup Checklist Verify Stream API Route', () => {
  const orgId = 'org-test-123';
  const projectId = 'proj-test-456';
  const mockParams = {
    params: Promise.resolve({ orgId, projectId }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'usr-1', email: 'owner@example.com' },
    });
  });

  function createPostRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(`http://localhost:3000/api/orgs/${orgId}/projects/${projectId}/setup-checklist/verify-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function createGetRequest(search: string = ''): NextRequest {
    return new NextRequest(`http://localhost:3000/api/orgs/${orgId}/projects/${projectId}/setup-checklist/verify-stream${search}`, {
      method: 'GET',
    });
  }

  it('rejects unauthenticated requests if permission check fails', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
    requireOrgPermissionMock.mockResolvedValueOnce({ error: errorResponse });

    const res = await POST(createPostRequest({ requirementId: 'req_web_sdk' }), mockParams);
    expect(res.status).toBe(403);
  });

  it('returns 400 when requirementId is missing in POST body', async () => {
    const res = await POST(createPostRequest({}), mockParams);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('requirement_id_required');
  });

  it('successfully verifies live stream via POST', async () => {
    verifyStreamForRequirementMock.mockResolvedValueOnce({
      success: true,
      requirementId: 'req_web_sdk',
      verified: true,
      liveDetected: true,
      recordCount: 12,
      latestRecordAt: '2026-10-04T03:50:00.000Z',
      verifiedRequirements: ['req_web_sdk'],
      testResult: {
        status: 'success',
        recordsIngested: 12,
        connectorId: 'growthos_sdk',
        timestamp: '2026-10-04T03:50:00.000Z',
        message: 'Live stream verified',
      },
    });

    const res = await POST(
      createPostRequest({ requirementId: 'req_web_sdk', lookbackHours: 24, simulateTestEvent: false }),
      mockParams,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.liveDetected).toBe(true);
    expect(data.recordCount).toBe(12);
    expect(verifyStreamForRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        projectId,
        requirementId: 'req_web_sdk',
        lookbackHours: 24,
      }),
    );
  });

  it('checks stream status for single requirement via GET', async () => {
    verifyStreamForRequirementMock.mockResolvedValueOnce({
      success: true,
      requirementId: 'req_web_sdk',
      verified: true,
      liveDetected: true,
      recordCount: 5,
    });

    const res = await GET(createGetRequest('?requirementId=req_web_sdk&lookbackHours=12'), mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recordCount).toBe(5);
    expect(verifyStreamForRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        projectId,
        requirementId: 'req_web_sdk',
        lookbackHours: 12,
        action: 'check',
      }),
    );
  });

  it('checks all stream requirements when no requirementId is passed in GET', async () => {
    verifyStreamForRequirementMock.mockResolvedValue({
      success: true,
      verified: false,
      liveDetected: false,
    });

    const res = await GET(createGetRequest('?lookbackHours=24'), mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.streams).toHaveProperty('req_web_sdk');
    expect(data.streams).toHaveProperty('req_checkout_stream');
  });
});

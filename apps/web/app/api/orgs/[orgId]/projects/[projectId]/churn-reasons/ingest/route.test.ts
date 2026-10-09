import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const {
  requireOrgPermissionMock,
  ingestCancellationReasonFeedbackMock,
  listEnvironmentsForProjectMock,
} = vi.hoisted(() => ({
  requireOrgPermissionMock: vi.fn(),
  ingestCancellationReasonFeedbackMock: vi.fn(),
  listEnvironmentsForProjectMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock('@/lib/firebase/firestore', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
  ingestCancellationReasonFeedback: ingestCancellationReasonFeedbackMock,
  listEnvironmentsForProject: listEnvironmentsForProjectMock,
  ProjectNotFoundError: class ProjectNotFoundError extends Error {
    constructor() {
      super('Project not found');
      this.name = 'ProjectNotFoundError';
    }
  },
}));

describe('POST /api/orgs/[orgId]/projects/[projectId]/churn-reasons/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated or unauthorized callers without ingest.write', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) as any,
      context: null as any,
    });

    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ reasonCode: 'too_expensive' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: 'org_1', projectId: 'proj_1' }),
    });

    expect(response.status).toBe(403);
  });

  it('ingests a single reasonCode payload successfully', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'usr_1', email: 'user@example.com' },
    });

    listEnvironmentsForProjectMock.mockResolvedValue([
      { id: 'env_prod', name: 'prod' } as any,
    ]);

    ingestCancellationReasonFeedbackMock.mockResolvedValue({
      accepted: 1,
      quarantined: 0,
      batchId: 'batch_test_1',
    });

    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({
        reasonCode: 'too_expensive',
        comment: 'Too expensive for our small startup',
        customerId: 'cus_xyz',
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: 'org_1', projectId: 'proj_1' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      batchId: 'batch_test_1',
      accepted: 1,
      quarantined: 0,
    });

    expect(ingestCancellationReasonFeedbackMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      projectId: 'proj_1',
      environmentId: 'env_prod',
      feedback: [
        {
          reasonCode: 'too_expensive',
          comment: 'Too expensive for our small startup',
          customerId: 'cus_xyz',
          timestamp: undefined,
        },
      ],
      createdByUserId: 'usr_1',
    });
  });

  it('ingests a batch of records successfully', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'usr_1', email: 'user@example.com' },
    });

    ingestCancellationReasonFeedbackMock.mockResolvedValue({
      accepted: 2,
      quarantined: 0,
      batchId: 'batch_test_2',
    });

    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({
        environmentId: 'env_custom',
        records: [
          { reasonCode: 'missing_features', comment: 'Need Salesforce sync' },
          { reasonCode: 'switched_competitor', comment: 'Went to Competitor' },
        ],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: 'org_1', projectId: 'proj_1' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.accepted).toBe(2);
    expect(ingestCancellationReasonFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: 'env_custom',
        feedback: [
          { reasonCode: 'missing_features', comment: 'Need Salesforce sync' },
          { reasonCode: 'switched_competitor', comment: 'Went to Competitor' },
        ],
      }),
    );
  });

  it('rejects empty payload with 400', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'usr_1' },
    });

    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: 'org_1', projectId: 'proj_1' }),
    });

    expect(response.status).toBe(400);
  });
});

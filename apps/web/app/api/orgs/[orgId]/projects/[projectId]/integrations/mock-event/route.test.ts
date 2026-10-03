import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const { requireOrgMembershipMock, requireOrgPermissionMock } = vi.hoisted(() => ({
  requireOrgMembershipMock: vi.fn(),
  requireOrgPermissionMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgMembership: requireOrgMembershipMock,
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock('@/lib/firebase/firestore', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
  ingestBatch: vi.fn().mockResolvedValue({
    batchId: 'batch_mock_123',
    accepted: 1,
    quarantined: 0,
    total: 1,
    duplicates: 0,
    kind: 'event',
  }),
  listEnvironmentsForProject: vi.fn().mockResolvedValue([{ id: 'env_prod', name: 'Production' }]),
  ProjectNotFoundError: class ProjectNotFoundError extends Error {
    constructor() {
      super('Project not found');
      this.name = 'ProjectNotFoundError';
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireOrgMembershipMock.mockResolvedValue({ user: { id: 'user_owner_1' } });
  requireOrgPermissionMock.mockResolvedValue({ user: { id: 'user_owner_1' } });
});

function mockEventRequest(
  orgId: string,
  projectId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/integrations/mock-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/integrations/mock-event', () => {
  it('rejects unauthenticated requests with 401', async () => {
    requireOrgMembershipMock.mockResolvedValue({
      error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    });

    const { request, params } = mockEventRequest('org_1', 'prj_1', { connectorId: 'stripe' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects non-members with 404', async () => {
    requireOrgMembershipMock.mockResolvedValue({
      error: NextResponse.json({ error: 'not_found' }, { status: 404 }),
    });

    const { request, params } = mockEventRequest('org_1', 'prj_1', { connectorId: 'stripe' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('emits mock event for Stripe subscription and returns 200 with connected status', async () => {
    const { request, params } = mockEventRequest('org_1', 'prj_1', {
      connectorId: 'stripe',
      eventType: 'subscription_state_change',
      scenario: 'upgrade',
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.connectorId).toBe('stripe');
    expect(data.eventType).toBe('subscription_state_change');
    expect(data.connectorStatus).toBe('connected');
    expect(data.emittedPayload).toBeDefined();
    expect(data.emittedPayload.event).toBe('subscription_state_change');
    expect(data.emittedPayload.properties.changeType).toBe('upgrade');
  });

  it('emits mock event for Google Ads ad_spend measure and returns 200', async () => {
    const { request, params } = mockEventRequest('org_1', 'prj_1', {
      connectorId: 'google_ads',
      eventType: 'ad_spend',
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.connectorId).toBe('google_ads');
    expect(data.eventType).toBe('ad_spend');
    expect(data.connectorStatus).toBe('connected');
    expect(data.emittedPayload.measure).toBe('ad_spend');
  });

  it('emits mock event for GrowthOS SDK telemetry and returns 200', async () => {
    const { request, params } = mockEventRequest('org_1', 'prj_1', {
      connectorId: 'growthos_sdk',
      eventType: 'product_telemetry',
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.connectorId).toBe('growthos_sdk');
    expect(data.eventType).toBe('product_telemetry');
    expect(data.emittedPayload.anonId).toBeDefined();
  });

  it('emits mock event for HubSpot CRM lifecycle and returns 200', async () => {
    const { request, params } = mockEventRequest('org_1', 'prj_1', {
      connectorId: 'hubspot',
      eventType: 'crm_lifecycle',
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.connectorId).toBe('hubspot');
    expect(data.eventType).toBe('crm_lifecycle');
    expect(data.emittedPayload.event).toBe('crm_lifecycle');
  });
});

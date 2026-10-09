import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/orgs/[orgId]/projects/[projectId]/customers/expansion/route';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ExpansionRadarService } from '@growthos/firebase-orm-models';

vi.mock('@/lib/orgs/access', () => ({
  requireOrgPermission: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  ExpansionRadarService: {
    getCustomerExpansionRadarTelemetry: vi.fn(),
    recordCustomerExpansionEvent: vi.fn(),
  },
}));

describe('Customer Expansion API Route (/api/orgs/.../customers/expansion)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET handler', () => {
    it('returns permission error if caller lacks ingest.write', async () => {
      (requireOrgPermission as any).mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
      });

      const req = new NextRequest('http://localhost:3000/api/orgs/org-1/projects/proj-1/customers/expansion');
      const res = await GET(req, {
        params: Promise.resolve({ orgId: 'org-1', projectId: 'proj-1' }),
      });

      expect(res.status).toBe(403);
    });

    it('returns customer expansion telemetry on success', async () => {
      (requireOrgPermission as any).mockResolvedValueOnce({ error: null });
      (ExpansionRadarService.getCustomerExpansionRadarTelemetry as any).mockResolvedValueOnce({
        highExpansionPotentialCount: 248,
        potentialMrrLift: 38400,
        avgExpansionSpeedDays: 42,
        largeTeamAccountsCount: 86,
        upgradePenetrationRate: 34.2,
        tierDistribution: { free: 1240, starter: 1240, pro: 412, enterprise: 86 },
        recentEvents: [],
      });

      const req = new NextRequest('http://localhost:3000/api/orgs/org-1/projects/proj-1/customers/expansion?segment=enterprise');
      const res = await GET(req, {
        params: Promise.resolve({ orgId: 'org-1', projectId: 'proj-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.telemetry.highExpansionPotentialCount).toBe(248);
      expect(ExpansionRadarService.getCustomerExpansionRadarTelemetry).toHaveBeenCalledWith(
        'org-1',
        'proj-1',
        'enterprise',
      );
    });
  });

  describe('POST handler', () => {
    it('returns 400 invalid_payload when customerId is missing', async () => {
      (requireOrgPermission as any).mockResolvedValueOnce({ error: null });

      const req = new NextRequest('http://localhost:3000/api/orgs/org-1/projects/proj-1/customers/expansion', {
        method: 'POST',
        body: JSON.stringify({ accountName: 'Acme Corp' }),
      });

      const res = await POST(req, {
        params: Promise.resolve({ orgId: 'org-1', projectId: 'proj-1' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('invalid_payload');
    });

    it('records expansion event successfully', async () => {
      (requireOrgPermission as any).mockResolvedValueOnce({ error: null });
      (ExpansionRadarService.recordCustomerExpansionEvent as any).mockResolvedValueOnce({
        id: 'exp-new-1',
        organization_id: 'org-1',
        project_id: 'proj-1',
        customer_id: 'cust-10',
        account_name: 'Acme Global Corp',
        from_tier: 'Pro ($199)',
        to_tier: 'Enterprise ($650)',
        previous_mrr: 199,
        current_mrr: 650,
        mrr_delta: 451,
        movement_type: 'expansion',
        direction: 'upgrade',
        segment: 'enterprise',
        velocity_score: 95,
        trigger_reason: 'Enabled SAML SSO and audit logs',
        recorded_at: new Date().toISOString(),
      });

      const req = new NextRequest('http://localhost:3000/api/orgs/org-1/projects/proj-1/customers/expansion', {
        method: 'POST',
        body: JSON.stringify({
          customerId: 'cust-10',
          accountName: 'Acme Global Corp',
          previousMrr: 199,
          currentMrr: 650,
          previousStatus: 'active',
          currentStatus: 'active',
        }),
      });

      const res = await POST(req, {
        params: Promise.resolve({ orgId: 'org-1', projectId: 'proj-1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.event.mrr_delta).toBe(451);
      expect(json.event.movement_type).toBe('expansion');
    });
  });
});

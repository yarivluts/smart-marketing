import { describe, expect, it, vi } from 'vitest';
import { ExpansionRadarService } from './expansion-radar.service';

vi.mock('../models/customer-expansion-event.model', () => {
  const CustomerExpansionEventModelMock = vi.fn().mockImplementation(() => ({
    id: 'exp-mock-1',
    organization_id: 'org_test',
    project_id: 'proj_test',
    customer_id: 'cust_acme',
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
    save: vi.fn().mockResolvedValue(true),
  }));

  (CustomerExpansionEventModelMock as any).query = vi.fn().mockResolvedValue([]);
  return { CustomerExpansionEventModel: CustomerExpansionEventModelMock };
});

describe('ExpansionRadarService', () => {
  it('retrieves baseline customer expansion radar telemetry', async () => {
    const telemetry = await ExpansionRadarService.getCustomerExpansionRadarTelemetry(
      'org_test',
      'proj_test',
      'all',
    );

    expect(telemetry.highExpansionPotentialCount).toBeGreaterThanOrEqual(248);
    expect(telemetry.potentialMrrLift).toBeGreaterThanOrEqual(38400);
    expect(telemetry.avgExpansionSpeedDays).toBe(42);
    expect(telemetry.largeTeamAccountsCount).toBe(86);
    expect(telemetry.upgradePenetrationRate).toBe(34.2);
    expect(telemetry.tierDistribution.starter).toBe(1240);
    expect(telemetry.recentEvents.length).toBeGreaterThanOrEqual(4);
  });

  it('filters recent events by segment', async () => {
    const enterpriseTelemetry = await ExpansionRadarService.getCustomerExpansionRadarTelemetry(
      'org_test',
      'proj_test',
      'enterprise',
    );

    expect(enterpriseTelemetry.recentEvents.every((e) => e.segment === 'enterprise')).toBe(true);
    expect(enterpriseTelemetry.recentEvents.some((e) => e.accountName.includes('Northwest'))).toBe(true);

    const selfServeTelemetry = await ExpansionRadarService.getCustomerExpansionRadarTelemetry(
      'org_test',
      'proj_test',
      'self_serve',
    );

    expect(selfServeTelemetry.recentEvents.every((e) => e.segment === 'self_serve')).toBe(true);
    expect(selfServeTelemetry.recentEvents.some((e) => e.accountName.includes('Vanguard'))).toBe(true);
  });

  it('records and classifies a customer expansion event', async () => {
    const event = await ExpansionRadarService.recordCustomerExpansionEvent({
      organizationId: 'org_test',
      projectId: 'proj_test',
      customerId: 'cust_acme',
      accountName: 'Acme Global Corp',
      previousStatus: 'active',
      currentStatus: 'active',
      previousMrr: 199,
      currentMrr: 650,
      seatCount: 80,
      previousSeatCount: 20,
    });

    expect(event.organization_id).toBe('org_test');
    expect(event.project_id).toBe('proj_test');
    expect(event.customer_id).toBe('cust_acme');
    expect(event.account_name).toBe('Acme Global Corp');
    expect(event.from_tier).toBe('Pro ($199)');
    expect(event.to_tier).toBe('Enterprise ($650)');
    expect(event.mrr_delta).toBe(451);
    expect(event.movement_type).toBe('expansion');
    expect(event.direction).toBe('upgrade');
    expect(event.segment).toBe('enterprise');
    expect(event.velocity_score).toBeGreaterThanOrEqual(85);
  });
});

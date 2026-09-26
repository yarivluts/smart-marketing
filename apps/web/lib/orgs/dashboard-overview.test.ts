import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolicyBinding } from '@growthos/shared';

vi.mock('server-only', () => ({}));

const evaluateProjectSetupHealth = vi.fn();
const listRecentIngestBatchesForProject = vi.fn();
const getOnboardingState = vi.fn();
const listOrgProjects = vi.fn();

vi.mock('@/lib/orgs/queries', () => ({
  evaluateProjectSetupHealth: (...args: unknown[]) => evaluateProjectSetupHealth(...args),
  listRecentIngestBatchesForProject: (...args: unknown[]) => listRecentIngestBatchesForProject(...args),
  getOnboardingState: (...args: unknown[]) => getOnboardingState(...args),
  listOrgProjects: (...args: unknown[]) => listOrgProjects(...args),
}));

const { loadDashboardOverview, loadDashboardProject, DASHBOARD_PROJECT_CAP } = await import('./dashboard-overview');

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

function binding(role: PolicyBinding['role'], scope: { orgId: string; projectId?: string }): PolicyBinding {
  return scope.projectId
    ? { principalType: 'user', principalId: 'u1', role, scopeLevel: 'project', scopeId: scope.projectId }
    : { principalType: 'user', principalId: 'u1', role, scopeLevel: 'org', scopeId: scope.orgId };
}

describe('loadDashboardProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateProjectSetupHealth.mockResolvedValue({ environments: [] });
    listRecentIngestBatchesForProject.mockResolvedValue([{ created_at: '2026-09-20T11:00:00.000Z', accepted_count: 3, quarantined_count: 0 }]);
    getOnboardingState.mockResolvedValue({ step: 'sources' });
  });

  it('reads health and onboarding for a project admin', async () => {
    const card = await loadDashboardProject({ orgId: 'o1', project: { id: 'p1', name: 'P' }, userId: 'u1', bindings: [binding('project_admin', { orgId: 'o1', projectId: 'p1' })], now: NOW });
    expect(card.health?.acceptedCount).toBe(3);
    expect(card.onboardingStep).toBe('sources');
    expect(evaluateProjectSetupHealth).toHaveBeenCalledWith('o1', 'p1');
  });

  it('reads nothing sensitive for a viewer', async () => {
    const card = await loadDashboardProject({ orgId: 'o1', project: { id: 'p1', name: 'P' }, userId: 'u1', bindings: [binding('viewer', { orgId: 'o1' })], now: NOW });
    expect(card.health).toBeNull();
    expect(card.onboardingStep).toBeUndefined();
    expect(evaluateProjectSetupHealth).not.toHaveBeenCalled();
    expect(listRecentIngestBatchesForProject).not.toHaveBeenCalled();
    expect(getOnboardingState).not.toHaveBeenCalled();
  });

  it('marks the card unavailable instead of showing zeros when a read fails', async () => {
    evaluateProjectSetupHealth.mockRejectedValue(new Error('boom'));
    const card = await loadDashboardProject({ orgId: 'o1', project: { id: 'p1', name: 'P' }, userId: 'u1', bindings: [binding('org_owner', { orgId: 'o1' })], now: NOW });
    expect(card.healthUnavailable).toBe(true);
    expect(card.health).toBeNull();
  });
});

describe('loadDashboardOverview', () => {
  it('lists active orgs, counts pending invites, and caps the projects it reads', async () => {
    vi.clearAllMocks();
    evaluateProjectSetupHealth.mockResolvedValue(null);
    listRecentIngestBatchesForProject.mockResolvedValue([]);
    getOnboardingState.mockResolvedValue(null);
    const many = Array.from({ length: DASHBOARD_PROJECT_CAP + 3 }, (_, index) => ({ id: `p${index}`, name: `Project ${index}` }));
    listOrgProjects.mockResolvedValue(many);
    const overview = await loadDashboardOverview({
      userId: 'u1',
      memberships: [
        { membershipId: 'm1', organizationId: 'o1', organizationName: 'Acme', role: 'org_owner', status: 'active' },
        { membershipId: 'm2', organizationId: 'o2', organizationName: 'Invited Co', role: 'viewer', status: 'invited' },
      ] as never,
      bindings: [binding('org_owner', { orgId: 'o1' })],
      now: NOW,
    });
    expect(overview.pendingInviteCount).toBe(1);
    expect(overview.orgs).toHaveLength(1);
    expect(overview.orgs[0].projects).toHaveLength(DASHBOARD_PROJECT_CAP);
    expect(overview.orgs[0].hiddenProjectCount).toBe(3);
    expect(overview.orgs[0].projects[0].onboardingStep).toBeNull();
  });
});

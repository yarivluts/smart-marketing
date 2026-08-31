import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const {
  requireOrgPermissionMock,
  proposeAutomationBudgetChangeActionMock,
  proposeCampaignActivationActionMock,
  approveAutomationActionMock,
  executeAutomationActionMock,
  rollbackAutomationActionMock,
  listAutomationActionsForProjectMock,
} = vi.hoisted(() => ({
  requireOrgPermissionMock: vi.fn(),
  proposeAutomationBudgetChangeActionMock: vi.fn(),
  proposeCampaignActivationActionMock: vi.fn(),
  approveAutomationActionMock: vi.fn(),
  executeAutomationActionMock: vi.fn(),
  rollbackAutomationActionMock: vi.fn(),
  listAutomationActionsForProjectMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock('@/lib/orgs/mutations', () => ({
  proposeAutomationBudgetChangeAction: proposeAutomationBudgetChangeActionMock,
  proposeCampaignActivationAction: proposeCampaignActivationActionMock,
  approveAutomationAction: approveAutomationActionMock,
  executeAutomationAction: executeAutomationActionMock,
  rollbackAutomationAction: rollbackAutomationActionMock,
}));

vi.mock('@/lib/orgs/queries', () => ({
  listAutomationActionsForProject: listAutomationActionsForProjectMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

function postRequest(body: string) {
  return {
    request: new NextRequest('https://growthos.test/api/orgs/org-1/projects/proj-1/automation/actions/quick-execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId: 'org-1', projectId: 'proj-1' }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/quick-execute', () => {
  it('returns permission error when requireOrgPermission fails', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });

    const { request, params } = postRequest(
      JSON.stringify({ targetId: 't1', actionType: 'budget_change', afterDailyBudgetUsd: 120 }),
    );

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
  });

  it('returns 400 when targetId or actionType is missing', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      error: null,
    });

    const { request: r1, params: p1 } = postRequest(JSON.stringify({ actionType: 'budget_change' }));
    expect((await POST(r1, { params: p1 })).status).toBe(400);

    const { request: r2, params: p2 } = postRequest(JSON.stringify({ targetId: 't1', actionType: 'invalid_type' }));
    expect((await POST(r2, { params: p2 })).status).toBe(400);
  });

  it('atomically proposes, approves, and executes budget_change', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      error: null,
    });

    proposeAutomationBudgetChangeActionMock.mockResolvedValue({
      id: 'action-1',
      status: 'awaiting_approval',
      guardrail_violations: [],
    });
    approveAutomationActionMock.mockResolvedValue({ id: 'action-1', status: 'approved' });
    executeAutomationActionMock.mockResolvedValue({
      id: 'action-1',
      status: 'executed',
      target_id: 't1',
      before: { dailyBudgetUsd: 100 },
      after: { dailyBudgetUsd: 150 },
    });

    const { request, params } = postRequest(
      JSON.stringify({ targetId: 't1', actionType: 'budget_change', afterDailyBudgetUsd: 150 }),
    );

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('executed');
    expect(body.after.dailyBudgetUsd).toBe(150);

    expect(proposeAutomationBudgetChangeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'proj-1',
        targetId: 't1',
        afterDailyBudgetUsd: 150,
      }),
    );
    expect(approveAutomationActionMock).toHaveBeenCalledWith('org-1', 'proj-1', 'action-1', 'user-1');
    expect(executeAutomationActionMock).toHaveBeenCalledWith('org-1', 'proj-1', 'action-1', 'user-1', undefined);
  });

  it('returns 422 with violations when budget_change is blocked by guardrails', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      error: null,
    });

    proposeAutomationBudgetChangeActionMock.mockResolvedValue({
      id: 'action-blocked',
      status: 'blocked',
      guardrail_violations: [{ type: 'max_daily_budget_change_pct', message: 'Budget jump too high' }],
    });

    const { request, params } = postRequest(
      JSON.stringify({ targetId: 't1', actionType: 'budget_change', afterDailyBudgetUsd: 500 }),
    );

    const res = await POST(request, { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('guardrail_blocked');
    expect(body.violations).toHaveLength(1);
  });

  it('atomically proposes, approves, and executes campaign_activation', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      error: null,
    });

    proposeCampaignActivationActionMock.mockResolvedValue({
      id: 'action-act',
      status: 'awaiting_approval',
      guardrail_violations: [],
    });
    approveAutomationActionMock.mockResolvedValue({ id: 'action-act', status: 'approved' });
    executeAutomationActionMock.mockResolvedValue({
      id: 'action-act',
      status: 'executed',
      target_id: 't1',
      before: { status: 'paused' },
      after: { status: 'enabled' },
    });

    const { request, params } = postRequest(
      JSON.stringify({ targetId: 't1', actionType: 'campaign_activation' }),
    );

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('executed');
    expect(body.after.status).toBe('enabled');
  });

  it('pauses a campaign by rolling back active activation action if present', async () => {
    requireOrgPermissionMock.mockResolvedValue({
      user: { id: 'user-1' },
      error: null,
    });

    listAutomationActionsForProjectMock.mockResolvedValue([
      {
        id: 'act-1',
        target_id: 't1',
        action_type: 'campaign_activation',
        status: 'executed',
      },
    ]);

    rollbackAutomationActionMock.mockResolvedValue({
      id: 'act-1',
      status: 'rolled_back',
    });

    const { request, params } = postRequest(
      JSON.stringify({ targetId: 't1', actionType: 'campaign_pause' }),
    );

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    expect(rollbackAutomationActionMock).toHaveBeenCalledWith('org-1', 'proj-1', 'act-1', 'user-1', undefined);
  });
});

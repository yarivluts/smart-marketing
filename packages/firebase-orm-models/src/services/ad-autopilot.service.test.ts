import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeAutopilotOptimizationCycle,
  getAutopilotConfig,
  getAutopilotTelemetry,
  rollbackAutopilotAction,
  toggleAutopilotKillSwitch,
  updateAutopilotGuardrails,
} from './ad-autopilot.service';
import { ProjectModel } from '../models/project.model';
import { AutopilotConfigModel } from '../models/autopilot-config.model';
import { AutopilotActionModel } from '../models/autopilot-action.model';
import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { ProjectNotFoundError } from './resource-library.service';

vi.mock('../models/project.model', () => ({
  ProjectModel: {
    init: vi.fn(),
  },
}));

vi.mock('../models/autopilot-config.model', () => {
  const AutopilotConfigModelMock = vi.fn().mockImplementation(() => ({
    organization_id: '',
    project_id: '',
    daily_cap_usd: 30000,
    min_roas_floor: 2.5,
    max_cpa_ceiling: 35.0,
    max_shift_velocity_pct: 15.0,
    kill_switch_engaged: false,
    autopilot_active: true,
    updated_at: '',
    setPathParams: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
  }));
  (AutopilotConfigModelMock as any).init = vi.fn();
  return { AutopilotConfigModel: AutopilotConfigModelMock };
});

vi.mock('../models/autopilot-action.model', () => {
  const AutopilotActionModelMock = vi.fn().mockImplementation(() => ({
    id: 'act_mock_123',
    organization_id: '',
    project_id: '',
    action_type: 'budget_rebalance',
    channel: 'tiktok',
    before_budget_usd: 4100,
    after_budget_usd: 3485,
    delta_pct: -15,
    reason: 'Underperforming',
    impact: 'Reduced spend',
    status: 'executed',
    executed_at: '2026-10-09T20:00:00.000Z',
    executed_by_user_id: 'test_user',
    setPathParams: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
  }));
  (AutopilotActionModelMock as any).init = vi.fn();
  (AutopilotActionModelMock as any).initPath = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue([]),
    }),
  });
  return { AutopilotActionModel: AutopilotActionModelMock };
});

vi.mock('../models/automation-target-state.model', () => ({
  AutomationTargetStateModel: {
    initPath: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('./creative-fatigue.service', () => ({
  getCreativeFatigueTelemetryForProject: vi.fn().mockResolvedValue({
    hasData: false,
    creatives: [],
  }),
}));

vi.mock('./audit-log.service', () => ({
  recordAuditLogEntry: vi.fn().mockResolvedValue({}),
}));

describe('ad-autopilot.service', () => {
  const orgId = 'org_test';
  const projId = 'proj_test';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProjectModel.init).mockResolvedValue({
      id: projId,
      organization_id: orgId,
    } as any);
  });

  it('throws ProjectNotFoundError when project does not exist', async () => {
    vi.mocked(ProjectModel.init).mockResolvedValue(null as any);
    await expect(getAutopilotConfig(orgId, 'proj_missing')).rejects.toThrow(ProjectNotFoundError);
  });

  it('gets or initializes default autopilot config', async () => {
    vi.mocked(AutopilotConfigModel.init).mockResolvedValue(null as any);

    const config = await getAutopilotConfig(orgId, projId);
    expect(config.dailyCapUsd).toBe(30000);
    expect(config.minRoasFloor).toBe(2.5);
    expect(config.autopilotActive).toBe(true);
    expect(config.killSwitchEngaged).toBe(false);
  });

  it('updates autopilot guardrails and persists them', async () => {
    const existing = {
      project_id: projId,
      daily_cap_usd: 30000,
      min_roas_floor: 2.5,
      max_cpa_ceiling: 35.0,
      max_shift_velocity_pct: 15.0,
      kill_switch_engaged: false,
      autopilot_active: true,
      save: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(AutopilotConfigModel.init).mockResolvedValue(existing as any);

    const updated = await updateAutopilotGuardrails(
      orgId,
      projId,
      { dailyCapUsd: 45000, minRoasFloor: 3.0 },
      'user_123',
    );

    expect(updated.dailyCapUsd).toBe(45000);
    expect(updated.minRoasFloor).toBe(3.0);
    expect(existing.save).toHaveBeenCalled();
  });

  it('toggles emergency kill switch', async () => {
    const existing = {
      project_id: projId,
      daily_cap_usd: 30000,
      min_roas_floor: 2.5,
      max_cpa_ceiling: 35.0,
      max_shift_velocity_pct: 15.0,
      kill_switch_engaged: false,
      autopilot_active: true,
      save: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(AutopilotConfigModel.init).mockResolvedValue(existing as any);

    await toggleAutopilotKillSwitch(orgId, projId, true, 'Emergency test stop', 'user_123');
    expect(existing.kill_switch_engaged).toBe(true);
  });

  it('retrieves telemetry with baseline channels and KPIs', async () => {
    vi.mocked(AutopilotConfigModel.init).mockResolvedValue({
      project_id: projId,
      daily_cap_usd: 30000,
      min_roas_floor: 2.5,
      max_cpa_ceiling: 35.0,
      max_shift_velocity_pct: 15.0,
      kill_switch_engaged: false,
      autopilot_active: true,
    } as any);

    const telemetry = await getAutopilotTelemetry(orgId, projId);
    expect(telemetry.channels.length).toBe(4);
    expect(telemetry.kpis.roasVelocity.currentRoas).toBeGreaterThan(3.0);
    expect(telemetry.pipelineStages.length).toBe(5);
    expect(telemetry.autopilotActive).toBe(true);
  });

  it('executes autonomous optimization cycle and returns proposals and actions', async () => {
    vi.mocked(AutopilotConfigModel.init).mockResolvedValue({
      project_id: projId,
      daily_cap_usd: 30000,
      min_roas_floor: 2.5,
      max_cpa_ceiling: 35.0,
      max_shift_velocity_pct: 15.0,
      kill_switch_engaged: false,
      autopilot_active: true,
    } as any);

    const result = await executeAutopilotOptimizationCycle(orgId, projId, 'auto_worker');
    expect(result.executionId).toBeDefined();
    expect(result.rebalanceProposals.length).toBeGreaterThan(0);
    expect(result.newTelemetry).toBeDefined();
  });

  it('rolls back an executed action', async () => {
    const existingAction = {
      id: 'act_101',
      project_id: projId,
      action_type: 'budget_rebalance',
      channel: 'tiktok',
      before_budget_usd: 4100,
      after_budget_usd: 3485,
      delta_pct: -15,
      reason: 'Underperforming',
      impact: 'Reduced spend',
      status: 'executed',
      executed_at: '2026-10-09T20:00:00.000Z',
      executed_by_user_id: 'auto_worker',
      save: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(AutopilotActionModel.init).mockResolvedValue(existingAction as any);

    const rolledBack = await rollbackAutopilotAction(orgId, projId, 'act_101', 'user_admin');
    expect(rolledBack.status).toBe('rolled_back');
    expect(existingAction.status).toBe('rolled_back');
    expect(existingAction.save).toHaveBeenCalled();
  });
});

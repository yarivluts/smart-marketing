import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationTargetStateModel,
  BoardModel,
  GoalModel,
  MetricDefModel,
  SegmentModel,
  WinRuleModel,
} from '@growthos/firebase-orm-models';

const {
  listAutomationTargetStatesForProjectMock,
  listBoardsForProjectMock,
  listGoalsForProjectMock,
  listMetricDefinitionsForProjectMock,
  listSegmentsForProjectMock,
  listWinRulesForProjectMock,
} = vi.hoisted(() => ({
  listAutomationTargetStatesForProjectMock: vi.fn(),
  listBoardsForProjectMock: vi.fn(),
  listGoalsForProjectMock: vi.fn(),
  listMetricDefinitionsForProjectMock: vi.fn(),
  listSegmentsForProjectMock: vi.fn(),
  listWinRulesForProjectMock: vi.fn(),
}));

vi.mock('@/lib/orgs/queries', () => ({
  listAutomationTargetStatesForProject: listAutomationTargetStatesForProjectMock,
  listBoardsForProject: listBoardsForProjectMock,
  listGoalsForProject: listGoalsForProjectMock,
  listMetricDefinitionsForProject: listMetricDefinitionsForProjectMock,
  listSegmentsForProject: listSegmentsForProjectMock,
  listWinRulesForProject: listWinRulesForProjectMock,
}));

import { buildOmniSearchIndexForProject, type OmniSearchPermissions } from './omnisearch';

const ALL_ALLOWED: OmniSearchPermissions = {
  canSearchBoards: true,
  canSearchMetrics: true,
  canSearchSegments: true,
  canSearchCampaigns: true,
  canSearchGoals: true,
  canSearchWinRules: true,
};

const NONE_ALLOWED: OmniSearchPermissions = {
  canSearchBoards: false,
  canSearchMetrics: false,
  canSearchSegments: false,
  canSearchCampaigns: false,
  canSearchGoals: false,
  canSearchWinRules: false,
};

function board(overrides: Partial<BoardModel> = {}): BoardModel {
  return { id: 'board-1', name: 'Marketing', ...overrides } as unknown as BoardModel;
}

function metricDef(overrides: Partial<MetricDefModel> = {}): MetricDefModel {
  return { id: 'metric-1', name: 'CAC', status: 'active', ...overrides } as unknown as MetricDefModel;
}

function segment(overrides: Partial<SegmentModel> = {}): SegmentModel {
  return { id: 'segment-1', name: 'At-risk customers', ...overrides } as unknown as SegmentModel;
}

function campaignTarget(overrides: Partial<AutomationTargetStateModel> = {}): AutomationTargetStateModel {
  return {
    id: 'target-1',
    label: 'Spring Promo',
    target_type: 'campaign',
    ...overrides,
  } as unknown as AutomationTargetStateModel;
}

function goal(overrides: Partial<GoalModel> = {}): GoalModel {
  return { id: 'goal-1', name: 'Grow MRR 20%', ...overrides } as unknown as GoalModel;
}

function winRule(overrides: Partial<WinRuleModel> = {}): WinRuleModel {
  return { id: 'win-rule-1', name: 'Big order', ...overrides } as unknown as WinRuleModel;
}

describe('buildOmniSearchIndexForProject', () => {
  beforeEach(() => {
    listAutomationTargetStatesForProjectMock.mockReset();
    listBoardsForProjectMock.mockReset();
    listGoalsForProjectMock.mockReset();
    listMetricDefinitionsForProjectMock.mockReset();
    listSegmentsForProjectMock.mockReset();
    listWinRulesForProjectMock.mockReset();
  });

  it('maps each permitted entity type into an OmniSearchItem with a project-relative href', async () => {
    listBoardsForProjectMock.mockResolvedValue([board()]);
    listMetricDefinitionsForProjectMock.mockResolvedValue([metricDef()]);
    listSegmentsForProjectMock.mockResolvedValue([segment()]);
    listAutomationTargetStatesForProjectMock.mockResolvedValue([campaignTarget()]);
    listGoalsForProjectMock.mockResolvedValue([goal()]);
    listWinRulesForProjectMock.mockResolvedValue([winRule()]);

    const items = await buildOmniSearchIndexForProject('org-1', 'project-1', ALL_ALLOWED);

    expect(items).toEqual([
      { id: 'board-1', type: 'board', label: 'Marketing', href: '/orgs/org-1/projects/project-1/boards/board-1' },
      { id: 'metric-1', type: 'metric', label: 'CAC', href: '/orgs/org-1/projects/project-1/metric-defs' },
      { id: 'segment-1', type: 'segment', label: 'At-risk customers', href: '/orgs/org-1/projects/project-1/segments' },
      {
        id: 'target-1',
        type: 'campaign',
        label: 'Spring Promo',
        description: 'campaign',
        href: '/orgs/org-1/projects/project-1/automation',
      },
      { id: 'goal-1', type: 'goal', label: 'Grow MRR 20%', href: '/orgs/org-1/projects/project-1/goals/goal-1' },
      { id: 'win-rule-1', type: 'win_rule', label: 'Big order', href: '/orgs/org-1/projects/project-1/win-rules' },
    ]);
  });

  it('excludes superseded metric definition versions', async () => {
    listBoardsForProjectMock.mockResolvedValue([]);
    listMetricDefinitionsForProjectMock.mockResolvedValue([
      metricDef({ id: 'metric-old', status: 'superseded' }),
      metricDef({ id: 'metric-new', status: 'active' }),
    ]);
    listSegmentsForProjectMock.mockResolvedValue([]);
    listAutomationTargetStatesForProjectMock.mockResolvedValue([]);
    listGoalsForProjectMock.mockResolvedValue([]);
    listWinRulesForProjectMock.mockResolvedValue([]);

    const items = await buildOmniSearchIndexForProject('org-1', 'project-1', ALL_ALLOWED);

    expect(items.map((item) => item.id)).toEqual(['metric-new']);
  });

  it('skips fetching (and returns nothing for) a type the caller cannot see', async () => {
    const items = await buildOmniSearchIndexForProject('org-1', 'project-1', NONE_ALLOWED);

    expect(items).toEqual([]);
    expect(listBoardsForProjectMock).not.toHaveBeenCalled();
    expect(listMetricDefinitionsForProjectMock).not.toHaveBeenCalled();
    expect(listSegmentsForProjectMock).not.toHaveBeenCalled();
    expect(listAutomationTargetStatesForProjectMock).not.toHaveBeenCalled();
    expect(listGoalsForProjectMock).not.toHaveBeenCalled();
    expect(listWinRulesForProjectMock).not.toHaveBeenCalled();
  });

  it('only fetches the permitted types', async () => {
    listBoardsForProjectMock.mockResolvedValue([board()]);

    await buildOmniSearchIndexForProject('org-1', 'project-1', { ...NONE_ALLOWED, canSearchBoards: true });

    expect(listBoardsForProjectMock).toHaveBeenCalledWith('org-1', 'project-1');
    expect(listMetricDefinitionsForProjectMock).not.toHaveBeenCalled();
    expect(listSegmentsForProjectMock).not.toHaveBeenCalled();
    expect(listAutomationTargetStatesForProjectMock).not.toHaveBeenCalled();
    expect(listGoalsForProjectMock).not.toHaveBeenCalled();
    expect(listWinRulesForProjectMock).not.toHaveBeenCalled();
  });

  it('fetches goals only when canSearchGoals is granted', async () => {
    listGoalsForProjectMock.mockResolvedValue([goal()]);

    await buildOmniSearchIndexForProject('org-1', 'project-1', { ...NONE_ALLOWED, canSearchGoals: true });

    expect(listGoalsForProjectMock).toHaveBeenCalledWith('org-1', 'project-1');
    expect(listBoardsForProjectMock).not.toHaveBeenCalled();
  });

  it('fetches win rules only when canSearchWinRules is granted', async () => {
    listWinRulesForProjectMock.mockResolvedValue([winRule()]);

    await buildOmniSearchIndexForProject('org-1', 'project-1', { ...NONE_ALLOWED, canSearchWinRules: true });

    expect(listWinRulesForProjectMock).toHaveBeenCalledWith('org-1', 'project-1');
    expect(listBoardsForProjectMock).not.toHaveBeenCalled();
  });
});

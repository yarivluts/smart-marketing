import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl, createMockCopilotProposal } from '@/tests/e2e/helpers/test-harness';
import { AutomationHubDashboard } from './automation-hub-dashboard';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockPolicy = {
  maxDailyBudgetChangePct: 50,
  spendCeilingUsd: 1000,
  allowedHoursStartHourUtc: null,
  allowedHoursEndHourUtc: null,
  maxActionsPerDay: 20,
  maxGuardedMetricRegressionPct: null,
  protectedTargetIds: [],
  setAt: null,
};

const mockKillSwitch = {
  engaged: false,
};

const mockRecs = [
  {
    id: 'rec-1',
    category: 'budget' as const,
    title: 'Scale High-Performing Campaign Budget',
    description: 'Increase daily budget by 25% to capture demand.',
    beforeDiff: '$150/day',
    afterDiff: '$250/day',
    projectedImpact: '+28% projected conversions',
    actionProposal: createMockCopilotProposal(),
  },
];

const mockActions = [
  {
    id: 'act-1',
    targetId: 't-1',
    targetLabel: 'Meta Retargeting Campaign',
    status: 'executed' as const,
    actionType: 'budget_change' as const,
    diffEntries: [
      { key: 'daily_budget_usd', before: '$150/day', after: '$250/day' },
    ],
    guardrailViolations: [],
    proposedAt: '2026-08-30T17:00:00Z',
    executedAt: '2026-08-30T18:00:00Z',
  },
];

describe('AutomationHubDashboard Component', () => {
  it('renders 3 sub-tabs and switches between them', () => {
    renderWithIntl(
      <AutomationHubDashboard
        orgId="org-1"
        projectId="proj-1"
        projectName="GrowthOS Web"
        killSwitchStatus={mockKillSwitch}
        policy={mockPolicy}
        targets={[]}
        actions={mockActions}
        connections={[]}
        proactiveRecommendations={mockRecs}
        canExecute={true}
        canApprove={true}
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('automation-hub-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('tab-proposals')).toBeInTheDocument();
    expect(screen.getByTestId('tab-audit')).toBeInTheDocument();
    expect(screen.getByTestId('tab-rules')).toBeInTheDocument();

    // Default tab is proposals
    expect(screen.getByTestId('proposals-tab-content')).toBeInTheDocument();

    // Switch to Audit tab
    fireEvent.click(screen.getByTestId('tab-audit'));
    expect(screen.getByTestId('audit-tab-content')).toBeInTheDocument();

    // Switch to Rules tab
    fireEvent.click(screen.getByTestId('tab-rules'));
    expect(screen.getByTestId('rules-tab-content')).toBeInTheDocument();
  });

  it('renders smart recommendation cards in proposals tab', () => {
    renderWithIntl(
      <AutomationHubDashboard
        orgId="org-1"
        projectId="proj-1"
        projectName="GrowthOS Web"
        killSwitchStatus={mockKillSwitch}
        policy={mockPolicy}
        targets={[]}
        actions={mockActions}
        connections={[]}
        proactiveRecommendations={mockRecs}
        canExecute={true}
        canApprove={true}
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('smart-card')).toBeInTheDocument();
    expect(screen.getByText('Scale High-Performing Campaign Budget')).toBeInTheDocument();
    expect(screen.getByTestId('smart-card-approve')).toBeInTheDocument();
  });

  it('displays kill switch active badge when kill switch is engaged', () => {
    renderWithIntl(
      <AutomationHubDashboard
        orgId="org-1"
        projectId="proj-1"
        projectName="GrowthOS Web"
        killSwitchStatus={{ engaged: true, reason: 'Emergency Maintenance' }}
        policy={mockPolicy}
        targets={[]}
        actions={mockActions}
        connections={[]}
        proactiveRecommendations={mockRecs}
        canExecute={true}
        canApprove={true}
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('kill-switch-active-badge')).toBeInTheDocument();
    expect(screen.getByText('KILL SWITCH ACTIVE')).toBeInTheDocument();
  });
});

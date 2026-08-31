import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { FunnelGoalsDashboard } from './funnel-goals-dashboard';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { buildFunnelGoalsCockpitData } from '../../lib/orgs/funnel-goals-synthesizer';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
});

describe('FunnelGoalsDashboard Component', () => {
  it('renders cockpit header, 6 executive KPI cards, and default Conversion Funnels tab', () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: null,
      goals: [],
      projectId: 'test-proj',
    });

    renderWithIntl(
      <FunnelGoalsDashboard
        orgId="org-1"
        projectId="test-proj"
        projectName="EasySign"
        cockpitData={cockpitData}
        canExecute={true}
      />,
    );

    expect(screen.getByTestId('funnel-goals-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-metric-cards')).toBeInTheDocument();

    // 6 KPI cards assertions
    expect(screen.getByText('Overall Funnel Conv.')).toBeInTheDocument();
    expect(screen.getByText('Goals on Track')).toBeInTheDocument();
    expect(screen.getByText('M1 Avg Retention')).toBeInTheDocument();
    expect(screen.getByText('Conversion Velocity')).toBeInTheDocument();
    expect(screen.getByText('40d Payback Rev')).toBeInTheDocument();
    expect(screen.getByText('Dunning Recovery')).toBeInTheDocument();

    // Funnel tab is open by default
    expect(screen.getByTestId('funnel-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
  });

  it('supports 1-click execution of proactive drop-off recommendation', async () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: null,
      goals: [],
      projectId: 'test-proj',
    });

    renderWithIntl(
      <FunnelGoalsDashboard
        orgId="org-1"
        projectId="test-proj"
        cockpitData={cockpitData}
        canExecute={true}
      />,
    );

    expect(screen.getByTestId('proactive-recommendation-card')).toBeInTheDocument();

    const applyBtn = screen.getByTestId('apply-funnel-rec-btn');
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByTestId('rec-applied-badge')).toHaveTextContent('Optimization active!');
    });
  });

  it('switches to Goals tab, filters goals by query, and opens create modal', () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: null,
      goals: [],
      projectId: 'test-proj',
    });

    renderWithIntl(
      <FunnelGoalsDashboard
        orgId="org-1"
        projectId="test-proj"
        cockpitData={cockpitData}
        canExecute={true}
      />,
    );

    // Switch to Goals tab
    fireEvent.click(screen.getByTestId('tab-goals-btn'));
    expect(screen.getByTestId('goals-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('goals-cards-grid')).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByTestId('search-goals-input');
    fireEvent.change(searchInput, { target: { value: 'MRR' } });

    expect(screen.getByText('Q3 Monthly Recurring Revenue (MRR)')).toBeInTheDocument();

    // Open create goal modal
    fireEvent.click(screen.getByTestId('create-new-goal-btn'));
    expect(screen.getByTestId('create-goal-modal')).toBeInTheDocument();
  });

  it('switches to Retention tab and renders heatmap matrix, payback velocity, and intent calibration', () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: null,
      goals: [],
      projectId: 'test-proj',
    });

    renderWithIntl(
      <FunnelGoalsDashboard
        orgId="org-1"
        projectId="test-proj"
        cockpitData={cockpitData}
        canExecute={true}
      />,
    );

    // Switch to Retention tab
    fireEvent.click(screen.getByTestId('tab-retention-btn'));
    expect(screen.getByTestId('retention-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('cohort-retention-matrix')).toBeInTheDocument();
    expect(screen.getByText('40-Day Payback Velocity')).toBeInTheDocument();
    expect(screen.getByText('Signup Quality & Payback Calibration')).toBeInTheDocument();
    expect(screen.getByText('Diamond (Tier 1)')).toBeInTheDocument();
  });
});

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
    /*
      A real funnel outcome, not null. A proactive recommendation is now only raised from the
      project's own funnel - with the zero-config sample there is nothing measured to
      recommend against, and the card's Apply button POSTs to the real automation endpoint.
    */
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: {
        ok: true,
        steps: [
          { stageKey: 'sent', stepOrder: 1, customerCount: 500, conversionRateFromFirst: 1 },
          { stageKey: 'viewed', stepOrder: 2, customerCount: 200, conversionRateFromFirst: 0.4 },
          { stageKey: 'signed', stepOrder: 3, customerCount: 150, conversionRateFromFirst: 0.3 },
        ],
      },
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
  /**
   * buildFunnelGoalsCockpitData took only `.steps` off buildVisualFunnelData and dropped its
   * isSimulated flag, and the dashboard never passed one to VisualFunnelSteps - which has
   * always been able to render the badge. So createMockEasySignFunnel's 1000/380/220 showed
   * as the project's own funnel with nothing marking it as a sample.
   */
  it('badges the funnel as sample data when the project has no real funnel', () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: null,
      goals: [],
      projectId: 'test-proj',
    });

    expect(cockpitData.isSimulatedFunnel).toBe(true);

    renderWithIntl(
      <FunnelGoalsDashboard orgId="org-1" projectId="test-proj" cockpitData={cockpitData} canExecute={false} />,
    );

    expect(screen.getByText('Simulated Mode (Zero-Config)')).toBeInTheDocument();
  });

  it('shows no sample badge once the funnel is real', () => {
    const cockpitData = buildFunnelGoalsCockpitData({
      funnelOutcome: {
        ok: true,
        steps: [
          { stageKey: 'sent', stepOrder: 1, customerCount: 500, conversionRateFromFirst: 1 },
          { stageKey: 'viewed', stepOrder: 2, customerCount: 200, conversionRateFromFirst: 0.4 },
        ],
      },
      goals: [],
      projectId: 'test-proj',
    });

    expect(cockpitData.isSimulatedFunnel).toBe(false);

    renderWithIntl(
      <FunnelGoalsDashboard orgId="org-1" projectId="test-proj" cockpitData={cockpitData} canExecute={false} />,
    );

    expect(screen.queryByText('Simulated Mode (Zero-Config)')).not.toBeInTheDocument();
  });
});

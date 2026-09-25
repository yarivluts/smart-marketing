import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { FunnelGoalsDashboard } from './funnel-goals-dashboard';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { buildFunnelGoalsCockpitData } from '../../lib/orgs/funnel-goals-synthesizer';
import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';
import enMessages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
});

const REAL_FUNNEL = {
  ok: true as const,
  steps: [
    { eventSchemaName: 'sent_event', stageKey: 'sent', stepOrder: 1, customerCount: 500, conversionRateFromFirst: 1 },
    { eventSchemaName: 'viewed_event', stageKey: 'viewed', stepOrder: 2, customerCount: 200, conversionRateFromFirst: 0.4 },
    { eventSchemaName: 'signed_event', stageKey: 'signed', stepOrder: 3, customerCount: 150, conversionRateFromFirst: 0.3 },
  ],
};

/** EasySign's real project as the integrator found it: no funnel defined, no goals, nothing landed. */
function emptyCockpit() {
  return buildFunnelGoalsCockpitData({
    funnelOutcome: { ok: true, steps: [] },
    goals: [],
    cohortOutcome: { ok: true, rows: [] },
    paybackOutcome: { ok: true, windows: [] },
    calibrationOutcome: { ok: true, tiers: [] },
  });
}

function renderDashboard(cockpitData = emptyCockpit(), canExecute = true) {
  return renderWithIntl(
    <FunnelGoalsDashboard
      orgId="org-1"
      projectId="test-proj"
      projectName="EasySign"
      cockpitData={cockpitData}
      canExecute={canExecute}
    />,
  );
}

describe('FunnelGoalsDashboard Component', () => {
  it('renders the cockpit header and all six KPI cards', () => {
    renderDashboard();

    expect(screen.getByTestId('funnel-goals-dashboard')).toBeInTheDocument();
    for (const label of [
      'Overall Funnel Conv.',
      'Goals on Track',
      'M1 Avg Retention',
      'Conversion Velocity',
      '40d Payback Rev',
      'Dunning Recovery',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('funnel-tab-content')).toBeInTheDocument();
  });

  /**
   * Jira B15: on EasySign's real project (no funnel defined) this page showed "Simulated Mode
   * (Zero-Config)" with 955 started / 363 viewed / 210 signed, a 22% conversion, a "Funnel
   * drop-off alert" and an "Ask AI Copilot" retargeting suggestion - all invented.
   */
  describe('with no real data (the integrator case)', () => {
    it('shows an honest no-funnel empty state with a way to define one, and no numbers', () => {
      renderDashboard();

      const empty = screen.getByTestId('funnel-empty-state');
      expect(empty).toHaveTextContent(enMessages.FunnelGoals.funnelEmptyTitle);
      expect(empty).toHaveTextContent(enMessages.FunnelGoals.funnelUnavailable.no_funnel);
      expect(within(empty).getByTestId('define-funnel-link')).toHaveAttribute(
        'href',
        '/orgs/org-1/projects/test-proj/onboarding',
      );

      expect(screen.queryByTestId('visual-funnel-container')).not.toBeInTheDocument();
      expect(screen.queryByTestId('funnel-dropoff-alert-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ask-copilot-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('proactive-recommendation-card')).not.toBeInTheDocument();
      expect(screen.queryByText(/Simulated Mode/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Drop-off Alert/i)).not.toBeInTheDocument();
      // No figure of any kind on the funnel tab.
      expect(screen.getByTestId('funnel-tab-content').textContent ?? '').not.toMatch(/\d/);
    });

    it('renders every KPI as "No data" - no invented conversion rate or goal pace', () => {
      renderDashboard();
      expect(screen.getByTestId('kpi-overall-conversion')).toHaveTextContent('No data');
      expect(screen.getByTestId('kpi-goals-on-track')).toHaveTextContent('No data');
      // All six cards: nothing in this project has been measured.
      expect(within(screen.getByTestId('kpi-metric-cards')).getAllByText('No data')).toHaveLength(6);
    });

    it('shows a no-goals empty state with a link to the goals page instead of demo goals', () => {
      renderDashboard();
      fireEvent.click(screen.getByTestId('tab-goals-btn'));

      const empty = screen.getByTestId('goals-empty-state');
      expect(empty).toHaveTextContent(enMessages.FunnelGoals.goalsEmptyTitle);
      expect(within(empty).getByTestId('goals-page-link')).toHaveAttribute('href', '/orgs/org-1/projects/test-proj/goals');
      expect(screen.queryByTestId('goals-cards-grid')).not.toBeInTheDocument();
      expect(screen.queryByText(/Q3 Monthly Recurring Revenue/)).not.toBeInTheDocument();
      expect(screen.queryByText('Demo Data')).not.toBeInTheDocument();
      // The create button is still offered to people who can create goals.
      expect(screen.getByTestId('create-new-goal-btn')).toBeInTheDocument();
    });

    it('shows not-enough-data states for cohorts, payback and calibration instead of sample rows', () => {
      renderDashboard();
      fireEvent.click(screen.getByTestId('tab-retention-btn'));

      expect(screen.getByTestId('cohort-retention-empty')).toHaveTextContent(enMessages.CohortRetention.empty);
      expect(screen.getByTestId('payback-empty-state')).toHaveTextContent(enMessages.FunnelGoals.paybackNoData);
      expect(screen.getByTestId('calibration-empty-state')).toHaveTextContent(enMessages.FunnelGoals.calibrationNoData);

      const retention = screen.getByTestId('retention-tab-content');
      expect(retention.textContent ?? '').not.toMatch(/\$\d/);
      expect(screen.queryByText(/Diamond/)).not.toBeInTheDocument();
      expect(screen.queryByText('Feb 2026')).not.toBeInTheDocument();
    });

    it('explains a warehouse failure rather than calling it "no funnel"', () => {
      renderDashboard(
        buildFunnelGoalsCockpitData({
          funnelOutcome: { ok: false, reason: 'warehouse_not_configured', message: 'x' },
          goals: [],
          paybackOutcome: { ok: false, reason: 'quota_exceeded', message: 'x' },
        }),
      );
      const empty = screen.getByTestId('funnel-empty-state');
      expect(empty).toHaveTextContent(enMessages.FunnelGoals.funnelUnavailable.warehouse_not_configured);
      expect(within(empty).queryByTestId('define-funnel-link')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tab-retention-btn'));
      expect(screen.getByTestId('payback-empty-state')).toHaveTextContent(
        enMessages.FunnelGoals.sectionUnavailable.quota_exceeded,
      );
    });
  });

  describe('with real data (rendering unchanged)', () => {
    it('renders the measured funnel, its drop-off alert and the proactive recommendation', () => {
      renderDashboard(buildFunnelGoalsCockpitData({ funnelOutcome: REAL_FUNNEL, goals: [] }));

      expect(screen.queryByTestId('funnel-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
      expect(screen.getByTestId('count-sent')).toHaveTextContent('500 people');
      expect(screen.getByTestId('count-viewed')).toHaveTextContent('200 people');
      expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();
      expect(screen.getByTestId('ask-copilot-btn')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-overall-conversion')).toHaveTextContent('30%');
      expect(screen.getByTestId('proactive-recommendation-card')).toBeInTheDocument();
      // 500 entrants is a real sample: no low-sample marker.
      expect(screen.queryByTestId('kpi-overall-conversion-low-sample')).not.toBeInTheDocument();
    });

    /*
      B22 (EasySign): its first real funnel had 4 entrants. The rate is real but must say how
      little it rests on, and nothing may recommend acting on it.
    */
    it('marks a rate on a handful of people and raises no alert or recommendation on it', () => {
      const tiny = { ...REAL_FUNNEL, steps: REAL_FUNNEL.steps.map((step, i) => ({ ...step, customerCount: [4, 2, 2][i] })) };
      renderDashboard(buildFunnelGoalsCockpitData({ funnelOutcome: tiny, goals: [] }));

      expect(screen.getByTestId('kpi-overall-conversion')).toHaveTextContent('50%');
      expect(screen.getByTestId('kpi-overall-conversion-low-sample')).toHaveTextContent('Based on 4 people - too few to rely on');
      expect(screen.queryByTestId('funnel-dropoff-alert-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ask-copilot-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('proactive-recommendation-card')).not.toBeInTheDocument();
    });

    it('supports 1-click execution of the proactive drop-off recommendation', async () => {
      renderDashboard(buildFunnelGoalsCockpitData({ funnelOutcome: REAL_FUNNEL, goals: [] }));

      fireEvent.click(screen.getByTestId('apply-funnel-rec-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('rec-applied-badge')).toHaveTextContent('Optimization active!');
      });
    });

    it('does NOT claim the recommendation was applied when the request fails', async () => {
      // This used to set "Optimization active!" on a failed request too.
      global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
      renderDashboard(buildFunnelGoalsCockpitData({ funnelOutcome: REAL_FUNNEL, goals: [] }));

      fireEvent.click(screen.getByTestId('apply-funnel-rec-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('rec-failed-message')).toHaveTextContent(enMessages.FunnelGoals.recommendationFailed);
      });
      expect(screen.queryByTestId('rec-applied-badge')).not.toBeInTheDocument();
    });

    it('renders measured goals and the real payback windows without a pace bar', () => {
      const goal = {
        id: 'g1',
        name: 'Signups',
        metric_name: 'signups',
        direction: 'maximize',
        target_value: 100,
        range_min: null,
        range_max: null,
        start_date: '2026-01-01',
        deadline: '2099-12-31',
        rhythm: 'even',
        owner_person_id: 'p1',
      } as unknown as GoalModel;
      const outcome = {
        ok: true,
        actualValue: 40,
        hasMeasurements: true,
        progress: { expectedAtNow: 30, progressRatio: 0.4, projectedFinalValue: 120, status: 'on_track', isGoalMet: false },
      } as unknown as GoalProgressOutcome;

      renderDashboard(
        buildFunnelGoalsCockpitData({
          funnelOutcome: REAL_FUNNEL,
          goals: [goal],
          goalOutcomes: new Map([['g1', outcome]]),
          paybackOutcome: {
            ok: true,
            windows: [
              { windowDays: 7, collectedRevenue: 310 },
              { windowDays: 40, collectedRevenue: 1150 },
            ],
          },
        }),
      );

      expect(screen.getByTestId('kpi-goals-on-track')).toHaveTextContent('1 / 1');

      fireEvent.click(screen.getByTestId('tab-goals-btn'));
      expect(screen.getByTestId('goals-cards-grid')).toBeInTheDocument();
      expect(screen.getByTestId('goal-status-g1')).toHaveTextContent('On track');
      // The goal card's "AI Copilot recommends budget reallocation" callout is not wired from
      // this page: nothing computes a budget recommendation for a goal.
      expect(screen.queryByTestId('goal-rec-card-g1')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('search-goals-input'), { target: { value: 'nothing-matches' } });
      expect(screen.getByTestId('empty-goals')).toHaveTextContent(enMessages.FunnelGoals.goalsNoMatch);

      fireEvent.click(screen.getByTestId('tab-retention-btn'));
      expect(screen.getByTestId('payback-window-7')).toHaveTextContent('$310');
      expect(screen.getByTestId('payback-window-40')).toHaveTextContent('$1,150');
      expect(screen.getByTestId('payback-no-target-note')).toHaveTextContent(enMessages.FunnelGoals.paybackNoTarget);
      expect(screen.queryByTestId('payback-empty-state')).not.toBeInTheDocument();
    });
  });
});

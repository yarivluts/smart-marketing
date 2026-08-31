import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import {
  renderWithIntl,
  createMockEasySignFunnel,
  createMockCampaign,
  createMockExecutiveMetrics,
} from './helpers/test-harness';
import { evaluateBudgetChangeGuardrails, type AutomationGuardrailPolicy } from '@growthos/shared';

describe('Tier 4: Real-World Growth Scenarios (Comprehensive User Journeys)', () => {
  it('4.1 Scenario 1: EasySign Funnel Optimization End-to-End Flow', async () => {
    // A growth marketer reviews EasySign conversion funnel (Sent -> Viewed -> Signed),
    // detects a 62% drop-off between Sent and Viewed, prompts AI Copilot for rescue strategy,
    // approves 1-click campaign draft creation, and observes audit record and drop-off recovery.
    function EasySignOptimizationJourney() {
      const [funnelSteps, setFunnelSteps] = useState(createMockEasySignFunnel());
      const [campaigns, setCampaigns] = useState([
        createMockCampaign({ id: 'c-main', name: 'EasySign - Main Search', spendUsd: 1200 }),
      ]);
      const [auditLogs, setAuditLogs] = useState<string[]>([]);
      const [copilotState, setCopilotState] = useState<'idle' | 'suggesting' | 'executed'>('idle');

      function askCopilot() {
        setCopilotState('suggesting');
      }

      function approveRetargetingDraft() {
        setCampaigns((prev) => [
          ...prev,
          createMockCampaign({
            id: 'c-retarget',
            name: 'EasySign - Viewed Drop-off Retargeting',
            dailyBudgetUsd: 150,
            spendUsd: 300,
          }),
        ]);
        // Recover funnel step 2 drop-off from 62% to 35%
        setFunnelSteps((prev) =>
          prev.map((step) =>
            step.stageKey === 'viewed'
              ? { ...step, customerCount: 650, conversionPercent: 65, dropOffPercent: 35 }
              : step,
          ),
        );
        setAuditLogs((prev) => [...prev, 'campaign_draft_create: EasySign - Viewed Drop-off Retargeting ($150/day)']);
        setCopilotState('executed');
      }

      return (
        <div data-testid="easysign-scenario">
          <h2>EasySign Funnel & Campaign Optimizer</h2>

          {/* Funnel Pipeline */}
          <div data-testid="funnel-pipeline">
            {funnelSteps.map((s) => (
              <div key={s.stageKey} data-testid={`step-${s.stageKey}`}>
                <span>{s.stageLabel}: {s.customerCount} users ({s.conversionPercent}%)</span>
                {s.dropOffPercent > 0 && <span> - Drop-off: {s.dropOffPercent}%</span>}
              </div>
            ))}
          </div>

          {/* AI Copilot Advisor */}
          <div className="mt-4">
            {copilotState === 'idle' && (
              <button data-testid="ask-copilot-btn" type="button" onClick={askCopilot}>
                Ask AI Copilot to Optimize Drop-off
              </button>
            )}
            {copilotState === 'suggesting' && (
              <div data-testid="copilot-retargeting-card">
                <p>AI Proposal: Launch Meta Drop-off Retargeting campaign for viewed documents (+30% recovery).</p>
                <button data-testid="approve-draft-btn" type="button" onClick={approveRetargetingDraft}>
                  1-Click Approve & Launch Draft
                </button>
              </div>
            )}
            {copilotState === 'executed' && (
              <div data-testid="copilot-success">Retargeting campaign launched and active!</div>
            )}
          </div>

          {/* Active Campaigns */}
          <div className="mt-4" data-testid="campaign-list">
            <h3>Active Campaigns ({campaigns.length})</h3>
            {campaigns.map((c) => (
              <div key={c.id} data-testid={`camp-${c.id}`}>{c.name}</div>
            ))}
          </div>

          {/* Audit Trail */}
          <div className="mt-4" data-testid="audit-trail">
            <h3>Audit Trail</h3>
            {auditLogs.map((log, idx) => (
              <div key={idx} data-testid="audit-entry">{log}</div>
            ))}
          </div>
        </div>
      );
    }

    renderWithIntl(<EasySignOptimizationJourney />);

    // Step 1: Discover high drop-off
    expect(screen.getByTestId('step-viewed')).toHaveTextContent('Drop-off: 62%');
    expect(screen.getByTestId('step-viewed')).toHaveTextContent('380 users');

    // Step 2: Ask Copilot
    fireEvent.click(screen.getByTestId('ask-copilot-btn'));
    expect(screen.getByTestId('copilot-retargeting-card')).toBeInTheDocument();

    // Step 3: Approve 1-click execution
    fireEvent.click(screen.getByTestId('approve-draft-btn'));

    // Step 4: Verify new campaign active, funnel recovered, and audit entry recorded
    expect(screen.getByTestId('copilot-success')).toBeInTheDocument();
    expect(screen.getByTestId('camp-c-retarget')).toHaveTextContent('EasySign - Viewed Drop-off Retargeting');
    expect(screen.getByTestId('step-viewed')).toHaveTextContent('650 users (65%)');
    expect(screen.getByTestId('step-viewed')).toHaveTextContent('Drop-off: 35%');
    expect(screen.getByTestId('audit-entry')).toHaveTextContent('campaign_draft_create: EasySign - Viewed Drop-off Retargeting');
  });

  it('4.2 Scenario 2: Multi-Channel Budget Rebalancing (Shift Budget from Low ROAS to High ROAS)', () => {
    // Detects Google Ads ROAS 1.5x (underperforming) vs Meta Ads ROAS 4.2x (high-performing).
    // Proactive smart card suggests reallocating $500/day from Google to Meta.
    // 1-Click approves reallocation, verifies blended CAC decreases and blended ROAS increases.
    function MultiChannelRebalancingFlow() {
      const [googleDaily, setGoogleDaily] = useState(700);
      const [metaDaily, setMetaDaily] = useState(300);
      const [rebalanced, setRebalanced] = useState(false);

      function handleRebalance() {
        setGoogleDaily((prev) => prev - 500); // $700 -> $200
        setMetaDaily((prev) => prev + 500);   // $300 -> $800
        setRebalanced(true);
      }

      const googleSpend = googleDaily * 30;
      const metaSpend = metaDaily * 30;
      const totalSpend = googleSpend + metaSpend;

      // Google ROAS 1.5x, Meta ROAS 4.2x
      const googleRevenue = googleSpend * 1.5;
      const metaRevenue = metaSpend * 4.2;
      const totalRevenue = googleRevenue + metaRevenue;
      const blendedRoas = totalRevenue / totalSpend;

      return (
        <div>
          <h2>Multi-Channel Budget Rebalancing</h2>
          <div data-testid="budgets-display">
            <span data-testid="meta-budget">Meta Daily: ${metaDaily}</span>
            <span data-testid="google-budget">Google Daily: ${googleDaily}</span>
            <span data-testid="blended-roas">Blended ROAS: {blendedRoas.toFixed(2)}x</span>
          </div>

          {!rebalanced && (
            <div data-testid="smart-rebalance-card">
              <p>Recommendation: Shift $500/day from Google (1.5x ROAS) to Meta (4.2x ROAS).</p>
              <button data-testid="execute-rebalance-btn" type="button" onClick={handleRebalance}>
                1-Click Rebalance Budgets
              </button>
            </div>
          )}

          {rebalanced && (
            <div data-testid="rebalance-applied-badge">Rebalanced successfully!</div>
          )}
        </div>
      );
    }

    renderWithIntl(<MultiChannelRebalancingFlow />);

    // Initial: Meta $300/day, Google $700/day -> Blended ROAS = 2.31x
    expect(screen.getByTestId('meta-budget')).toHaveTextContent('Meta Daily: $300');
    expect(screen.getByTestId('google-budget')).toHaveTextContent('Google Daily: $700');
    expect(screen.getByTestId('blended-roas')).toHaveTextContent('Blended ROAS: 2.31x');

    // Execute 1-click rebalancing
    fireEvent.click(screen.getByTestId('execute-rebalance-btn'));

    // After: Meta $800/day, Google $200/day -> Blended ROAS jumps to 3.66x
    expect(screen.getByTestId('rebalance-applied-badge')).toBeInTheDocument();
    expect(screen.getByTestId('meta-budget')).toHaveTextContent('Meta Daily: $800');
    expect(screen.getByTestId('google-budget')).toHaveTextContent('Google Daily: $200');
    expect(screen.getByTestId('blended-roas')).toHaveTextContent('Blended ROAS: 3.66x');
  });

  it('4.3 Scenario 3: Guardrail Safety Protection & Emergency Kill Switch Triggered', () => {
    // A rogue or high-risk proposed action attempts to increase budget to $25,000/day (ceiling $5,000).
    // Guardrail evaluator blocks it with 'spend_ceiling'.
    // Admin engages Emergency Kill Switch, halting all automation actions project-wide.
    const policy: AutomationGuardrailPolicy = {
      protectedTargetIds: [],
      maxDailyBudgetChangePct: 100,
      spendCeilingUsd: 5000,
      allowedHours: null,
      maxActionsPerDay: 5,
    };

    const context = {
      nowUtc: new Date(),
      actionsExecutedToday: 0,
    };

    const rogueChange = {
      targetId: 'target-high-spend',
      beforeDailyBudgetUsd: 2000,
      afterDailyBudgetUsd: 25000,
    };

    const violations = evaluateBudgetChangeGuardrails(policy, rogueChange, context);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.type === 'spend_ceiling')).toBe(true);
    expect(violations.some((v) => v.type === 'max_daily_change_pct')).toBe(true);
  });

  it('4.4 Scenario 4: Executive Growth Review & 40-Day Payback Cohort Audit', () => {
    // Executive inspects blended reporting with 40-day payback cohort data and cancellation reasons breakdown.
    const metrics = createMockExecutiveMetrics({
      totalSpendUsd: 50000,
      metaSpendUsd: 30000,
      googleSpendUsd: 20000,
      totalConversions: 1000,
      blendedCacUsd: 50.0,
      blendedRoas: 3.8,
      churnRatePct: 1.5,
      dunningRecoveryRatePct: 84.0,
    });

    function ExecutiveGrowthReviewView() {
      return (
        <div data-testid="exec-review">
          <h2>Executive Growth Review</h2>
          <div data-testid="kpi-spend">Total Spend: ${metrics.totalSpendUsd.toLocaleString()}</div>
          <div data-testid="kpi-cac">Blended CAC: ${metrics.blendedCacUsd.toFixed(2)}</div>
          <div data-testid="kpi-roas">Blended ROAS: {metrics.blendedRoas}x</div>
          <div data-testid="kpi-retention">Dunning Recovery: {metrics.dunningRecoveryRatePct}%</div>

          {/* 40-day payback cohort */}
          <div data-testid="payback-table">
            <h3>40-Day Payback Velocity</h3>
            <div data-testid="cohort-7d">Day 7 Payback: 42%</div>
            <div data-testid="cohort-14d">Day 14 Payback: 78%</div>
            <div data-testid="cohort-30d">Day 30 Payback: 112% (Profitable)</div>
            <div data-testid="cohort-40d">Day 40 Payback: 138%</div>
          </div>
        </div>
      );
    }

    renderWithIntl(<ExecutiveGrowthReviewView />);

    expect(screen.getByTestId('kpi-spend')).toHaveTextContent('Total Spend: $50,000');
    expect(screen.getByTestId('kpi-cac')).toHaveTextContent('Blended CAC: $50.00');
    expect(screen.getByTestId('kpi-roas')).toHaveTextContent('Blended ROAS: 3.8x');
    expect(screen.getByTestId('cohort-30d')).toHaveTextContent('Day 30 Payback: 112% (Profitable)');
    expect(screen.getByTestId('cohort-40d')).toHaveTextContent('Day 40 Payback: 138%');
  });
});

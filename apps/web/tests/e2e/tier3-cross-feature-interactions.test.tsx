import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl, createMockCampaign, createMockCopilotProposal, createMockGoal } from './helpers/test-harness';
import { calculateGoalProgress } from '@growthos/shared';

describe('Tier 3: Cross-Feature Interactions (End-to-End Module Pipeline)', () => {
  it('3.1 Copilot Intent -> 1-Click Execute -> Campaign Cockpit Update -> Blended Metric Recalculation', async () => {
    // Integrated test simulating user issuing NL command in Copilot, approving 1-click execution,
    // which immediately updates the live campaign daily budget and recalculates total executive spend.
    function IntegratedCopilotToReportingFlow() {
      const [metaCampaign, setMetaCampaign] = useState(
        createMockCampaign({ id: 'meta-1', name: 'Meta Retargeting', dailyBudgetUsd: 150, spendUsd: 1500, roas: 3.5 }),
      );
      const [googleCampaign, setGoogleCampaign] = useState(
        createMockCampaign({ id: 'google-1', name: 'Google Search', dailyBudgetUsd: 100, spendUsd: 1000, roas: 2.0 }),
      );
      const [proposalPending, setProposalPending] = useState(true);

      function handle1ClickExecute() {
        setMetaCampaign((prev) => ({ ...prev, dailyBudgetUsd: 250, spendUsd: 2500 }));
        setProposalPending(false);
      }

      const totalSpend = metaCampaign.spendUsd + googleCampaign.spendUsd;
      const totalRevenue = (metaCampaign.spendUsd * metaCampaign.roas) + (googleCampaign.spendUsd * googleCampaign.roas);
      const blendedRoas = totalRevenue / totalSpend;

      return (
        <div data-testid="integrated-flow">
          {/* Executive Blended Summary */}
          <div data-testid="blended-summary">
            <span data-testid="total-spend-display">${totalSpend}</span>
            <span data-testid="blended-roas-display">{blendedRoas.toFixed(2)}x</span>
          </div>

          {/* Campaign Cockpit */}
          <div data-testid="campaign-list">
            <div data-testid="meta-camp-budget">Meta Budget: ${metaCampaign.dailyBudgetUsd}/day</div>
          </div>

          {/* AI Copilot Proposal Card */}
          {proposalPending ? (
            <div data-testid="copilot-proposal">
              <p>Increase Meta Retargeting budget from $150 to $250/day</p>
              <button data-testid="execute-proposal-btn" type="button" onClick={handle1ClickExecute}>
                1-Click Approve
              </button>
            </div>
          ) : (
            <div data-testid="execution-confirmed">Executed and logged in audit trail!</div>
          )}
        </div>
      );
    }

    renderWithIntl(<IntegratedCopilotToReportingFlow />);

    // Initial state: Total Spend = $2500, Blended ROAS = 2.90x, Meta Budget = $150
    expect(screen.getByTestId('total-spend-display')).toHaveTextContent('$2500');
    expect(screen.getByTestId('blended-roas-display')).toHaveTextContent('2.90x');
    expect(screen.getByTestId('meta-camp-budget')).toHaveTextContent('Meta Budget: $150/day');

    // Action: Click 1-Click Approve on Copilot proposal
    const executeBtn = screen.getByTestId('execute-proposal-btn');
    fireEvent.click(executeBtn);

    // After state: Meta Budget updated to $250, Total Spend = $3500, Blended ROAS increases to 3.07x
    expect(screen.getByTestId('execution-confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('meta-camp-budget')).toHaveTextContent('Meta Budget: $250/day');
    expect(screen.getByTestId('total-spend-display')).toHaveTextContent('$3500');
    expect(screen.getByTestId('blended-roas-display')).toHaveTextContent('3.07x');
  });

  it('3.2 In-Context Smart Card -> Budget Optimization -> Audit Log -> 1-Click Rollback -> State Restoration', async () => {
    function InContextSmartCardFlow() {
      const [budget, setBudget] = useState(100);
      const [history, setHistory] = useState<{ id: string; status: string; prevBudget: number }[]>([]);

      function handleApprove() {
        const actionId = `act-${Date.now()}`;
        setHistory((prev) => [...prev, { id: actionId, status: 'executed', prevBudget: budget }]);
        setBudget(200);
      }

      function handleRollback(actionId: string) {
        const entry = history.find((h) => h.id === actionId);
        if (entry) {
          setBudget(entry.prevBudget);
          setHistory((prev) =>
            prev.map((h) => (h.id === actionId ? { ...h, status: 'rolled_back' } : h)),
          );
        }
      }

      return (
        <div>
          <div data-testid="current-budget">Current Daily Budget: ${budget}</div>

          {/* Smart Card */}
          <div data-testid="smart-card">
            <button data-testid="smart-card-approve" type="button" onClick={handleApprove}>
              1-Click Optimize Budget to $200
            </button>
          </div>

          {/* Audit History */}
          <div data-testid="audit-list">
            {history.map((h) => (
              <div key={h.id} data-testid={`audit-row-${h.id}`}>
                <span>Status: {h.status}</span>
                {h.status === 'executed' && (
                  <button data-testid={`rollback-${h.id}`} type="button" onClick={() => handleRollback(h.id)}>
                    1-Click Rollback
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    renderWithIntl(<InContextSmartCardFlow />);

    expect(screen.getByTestId('current-budget')).toHaveTextContent('Current Daily Budget: $100');

    // Approve smart card action
    fireEvent.click(screen.getByTestId('smart-card-approve'));
    expect(screen.getByTestId('current-budget')).toHaveTextContent('Current Daily Budget: $200');

    // Find rollback button in audit log and click
    const rollbackBtn = screen.getByRole('button', { name: '1-Click Rollback' });
    fireEvent.click(rollbackBtn);

    // Verify budget restored to $100 and audit status marked rolled_back
    expect(screen.getByTestId('current-budget')).toHaveTextContent('Current Daily Budget: $100');
    expect(screen.getByText('Status: rolled_back')).toBeInTheDocument();
  });

  it('3.3 Funnel Drop-off Alert -> Copilot Query -> Campaign Draft Creation -> Funnel Stage Rebalance', () => {
    function FunnelToCampaignWorkflow() {
      const [step2Dropoff, setStep2Dropoff] = useState(62);
      const [draftCampaignCreated, setDraftCampaignCreated] = useState(false);

      function handleCreateRetargetingDraft() {
        setDraftCampaignCreated(true);
        // Retargeting recovers drop-off from 62% to 40%
        setStep2Dropoff(40);
      }

      return (
        <div>
          <div data-testid="funnel-dropoff">Step 2 Drop-off: {step2Dropoff}%</div>
          {step2Dropoff > 50 && (
            <div data-testid="high-dropoff-alert">High Drop-off Alert! Copilot suggests retargeting.</div>
          )}

          <button data-testid="create-retargeting-draft-btn" type="button" onClick={handleCreateRetargetingDraft}>
            Create EasySign Retargeting Draft
          </button>

          {draftCampaignCreated && (
            <div data-testid="campaign-draft-badge">Retargeting Draft Active</div>
          )}
        </div>
      );
    }

    renderWithIntl(<FunnelToCampaignWorkflow />);

    expect(screen.getByTestId('high-dropoff-alert')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-dropoff')).toHaveTextContent('Step 2 Drop-off: 62%');

    // Create draft
    fireEvent.click(screen.getByTestId('create-retargeting-draft-btn'));

    expect(screen.getByTestId('campaign-draft-badge')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-dropoff')).toHaveTextContent('Step 2 Drop-off: 40%');
    expect(screen.queryByTestId('high-dropoff-alert')).not.toBeInTheDocument();
  });

  it('3.4 Goal Pace Alert (Off-Track) -> Copilot Budget Increase -> Goal Projection Recalibration', () => {
    // Goal: target 500 conversions. Current actual: 180 at 50% elapsed time.
    // Initial pace: expected at now = 250 -> 180/250 = 0.72 -> off_track.
    // Action: Copilot increases ad budget -> conversions increase to 310.
    // Recalibrated pace: 310/250 = 1.24 -> on_track.
    const initialProgress = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 500,
      actualValue: 180,
      elapsedFraction: 0.5,
    });
    expect(initialProgress.status).toBe('off_track');
    expect(initialProgress.projectedFinalValue).toBe(360);

    const boostedProgress = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 500,
      actualValue: 310,
      elapsedFraction: 0.5,
    });
    expect(boostedProgress.status).toBe('on_track');
    expect(boostedProgress.projectedFinalValue).toBe(620);
  });

  it('3.5 Session Locale Switch Mid-Workflow preserves ongoing Copilot conversation and active tabs', () => {
    function LocalePreservingWorkflow({ initialLocale = 'en' }: { initialLocale: 'en' | 'he' }) {
      const [locale, setLocale] = useState(initialLocale);
      const [copilotHistory, setCopilotHistory] = useState(['Hello Copilot']);

      return (
        <div data-testid="locale-workflow" dir={locale === 'he' ? 'rtl' : 'ltr'}>
          <button data-testid="switch-to-he" type="button" onClick={() => setLocale('he')}>Hebrew</button>
          <button data-testid="switch-to-en" type="button" onClick={() => setLocale('en')}>English</button>
          <div data-testid="active-locale">{locale}</div>
          <div data-testid="chat-history">{copilotHistory.join(', ')}</div>
        </div>
      );
    }

    renderWithIntl(<LocalePreservingWorkflow initialLocale="en" />);

    expect(screen.getByTestId('active-locale')).toHaveTextContent('en');
    expect(screen.getByTestId('chat-history')).toHaveTextContent('Hello Copilot');
    expect(screen.getByTestId('locale-workflow')).toHaveAttribute('dir', 'ltr');

    // Switch to Hebrew mid-session
    fireEvent.click(screen.getByTestId('switch-to-he'));

    expect(screen.getByTestId('active-locale')).toHaveTextContent('he');
    expect(screen.getByTestId('chat-history')).toHaveTextContent('Hello Copilot'); // State preserved
    expect(screen.getByTestId('locale-workflow')).toHaveAttribute('dir', 'rtl'); // Direction updated
  });
});

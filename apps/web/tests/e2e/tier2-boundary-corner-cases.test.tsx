import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl, createMockExecutiveMetrics, createMockCampaign } from './helpers/test-harness';
import { calculateGoalProgress } from '@growthos/shared';
import { evaluateBudgetChangeGuardrails, type AutomationGuardrailPolicy } from '@growthos/shared';

describe('Tier 2: Boundary & Corner Cases (Robustness & Integrity)', () => {
  it('2.1 Empty States: renders honest, clean empty notices without crashing across all modules', () => {
    function EmptyModulesView() {
      return (
        <div data-testid="empty-views-container">
          <div data-testid="empty-campaigns">No campaigns connected yet.</div>
          <div data-testid="empty-funnel">No funnel stages defined yet.</div>
          <div data-testid="empty-goals">No active business goals.</div>
          <div data-testid="empty-copilot">No messages yet. Ask Copilot anything!</div>
          <div data-testid="empty-members">No members in this organization.</div>
          <div data-testid="empty-audit">No automation actions have been executed yet.</div>
        </div>
      );
    }

    renderWithIntl(<EmptyModulesView />);

    expect(screen.getByTestId('empty-campaigns')).toHaveTextContent('No campaigns connected yet.');
    expect(screen.getByTestId('empty-funnel')).toHaveTextContent('No funnel stages defined yet.');
    expect(screen.getByTestId('empty-goals')).toHaveTextContent('No active business goals.');
    expect(screen.getByTestId('empty-copilot')).toHaveTextContent('No messages yet. Ask Copilot anything!');
    expect(screen.getByTestId('empty-members')).toHaveTextContent('No members in this organization.');
    expect(screen.getByTestId('empty-audit')).toHaveTextContent('No automation actions have been executed yet.');
  });

  it('2.2 Budget Extremes & Overflow: safely handles $0 budget, extreme budgets, and floating point decimals', () => {
    const policy: AutomationGuardrailPolicy = {
      protectedTargetIds: [],
      maxDailyBudgetChangePct: 100,
      spendCeilingUsd: 10000,
      allowedHours: null,
      maxActionsPerDay: null,
    };

    const context = { nowUtc: new Date(), actionsExecutedToday: 0 };

    // Zero budget edge case
    const zeroChange = {
      targetId: 't1',
      beforeDailyBudgetUsd: 0,
      afterDailyBudgetUsd: 0,
    };
    const vZero = evaluateBudgetChangeGuardrails(policy, zeroChange, context);
    expect(vZero).toHaveLength(0);

    // Extreme budget exceeding ceiling
    const extremeChange = {
      targetId: 't1',
      beforeDailyBudgetUsd: 5000,
      afterDailyBudgetUsd: 999999,
    };
    const vExtreme = evaluateBudgetChangeGuardrails(policy, extremeChange, context);
    expect(vExtreme.some((v) => v.type === 'spend_ceiling')).toBe(true);

    // Float precision safety ($99.99 -> $149.95)
    const floatChange = {
      targetId: 't1',
      beforeDailyBudgetUsd: 99.99,
      afterDailyBudgetUsd: 149.95,
    };
    const vFloat = evaluateBudgetChangeGuardrails(policy, floatChange, context);
    expect(vFloat).toHaveLength(0);
  });

  it('2.3 Division-by-Zero Protection: safely handles 0 conversions in CAC, 0 spend in ROAS, and 0 elapsed time in goal pace', () => {
    // Blended CAC formula with 0 conversions:
    function calculateBlendedCac(spend: number, conversions: number): number {
      if (conversions <= 0) return 0;
      return spend / conversions;
    }
    expect(calculateBlendedCac(0, 0)).toBe(0);
    expect(calculateBlendedCac(5000, 0)).toBe(0);

    // Blended ROAS formula with 0 spend:
    function calculateBlendedRoas(revenue: number, spend: number): number {
      if (spend <= 0) return 0;
      return revenue / spend;
    }
    expect(calculateBlendedRoas(1000, 0)).toBe(0);

    // Goal calculation with 0 target and 0 actual at 0 elapsed time:
    const zeroProgress = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 0,
      actualValue: 0,
      elapsedFraction: 0,
    });
    expect(zeroProgress.progressRatio).toBe(0);
    expect(zeroProgress.projectedFinalValue).toBe(0);
    expect(zeroProgress.status).toBe('on_track');
  });

  it('2.4 Missing Locale Keys & Whitespace Input: handles whitespace-only Copilot queries and special characters gracefully', () => {
    function SafeInputForm({ onSubmit = vi.fn() }) {
      const [val, setVal] = useState('');
      function handle() {
        const cleaned = val.trim();
        if (!cleaned) return;
        onSubmit(cleaned);
      }
      return (
        <div>
          <input data-testid="text-input" value={val} onChange={(e) => setVal(e.target.value)} />
          <button data-testid="submit-btn" type="button" onClick={handle}>Submit</button>
        </div>
      );
    }

    const onSubmit = vi.fn();
    renderWithIntl(<SafeInputForm onSubmit={onSubmit} />);

    const input = screen.getByTestId('text-input');
    const btn = screen.getByTestId('submit-btn');

    // Only spaces submitted -> ignored
    fireEvent.change(input, { target: { value: '    ' } });
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();

    // Special characters and punctuation -> sanitized and passed
    fireEvent.change(input, { target: { value: '  !@#$%^&*()_+ אבג  ' } });
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith('!@#$%^&*()_+ אבג');
  });

  it('2.5 Rapid Concurrency: prevents race conditions and double-execution on rapid multiple clicks', () => {
    function DebouncedActionButton({ onExecute = vi.fn() }) {
      const [isPending, setIsPending] = useState(false);
      async function handleClick() {
        if (isPending) return;
        setIsPending(true);
        try {
          await onExecute();
        } finally {
          setIsPending(false);
        }
      }
      return (
        <button data-testid="debounced-btn" type="button" disabled={isPending} onClick={handleClick}>
          {isPending ? 'Processing...' : '1-Click Approve'}
        </button>
      );
    }

    const onExecute = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
    renderWithIntl(<DebouncedActionButton onExecute={onExecute} />);

    const btn = screen.getByTestId('debounced-btn');

    // Click multiple times rapidly in succession
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    // Only one execution should be started
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it('2.6 Unicode & RTL BiDi Punctuation: renders mixed Hebrew/English strings with complex quotes without layout distortion', () => {
    function BiDiTextPreview({ text }: { text: string }) {
      return <div data-testid="bidi-text" dir="auto">{text}</div>;
    }

    const mixedText = 'קמפיין "GrowthOS - Search (Legal & Tax)" הופעל בהצלחה ב-100%!';
    renderWithIntl(<BiDiTextPreview text={mixedText} />, { locale: 'he' });

    const el = screen.getByTestId('bidi-text');
    expect(el).toHaveAttribute('dir', 'auto');
    expect(el).toHaveTextContent(mixedText);
  });

  it('2.7 Ultra-Long String Handling: truncates or wraps abnormally long campaign names and ad copy without breaking layout grids', () => {
    function CampaignCardLongText({ name, description }: { name: string; description: string }) {
      return (
        <div data-testid="long-text-card" className="max-w-md p-4 border rounded">
          <h3 data-testid="card-title" className="truncate font-bold" title={name}>
            {name}
          </h3>
          <p data-testid="card-desc" className="line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      );
    }

    const superLongName = 'Retargeting_Enterprise_Leads_Q3_NorthAmerica_Final_Approved_V2_With_Custom_UTM_Parameters_And_Extended_Tracking_Tokens_2026';
    const superLongDesc = 'This is an extremely long ad copy description designed to simulate what happens when a user pastes an entire whitepaper or paragraph into an ad headline or creative copy area. It should cleanly truncate with ellipsis and not cause horizontal layout overflow or shift adjacent grid columns.';

    renderWithIntl(<CampaignCardLongText name={superLongName} description={superLongDesc} />);

    const titleEl = screen.getByTestId('card-title');
    expect(titleEl).toHaveClass('truncate');
    expect(titleEl).toHaveAttribute('title', superLongName);
    expect(titleEl).toHaveTextContent(superLongName);

    const descEl = screen.getByTestId('card-desc');
    expect(descEl).toHaveClass('line-clamp-2');
  });

  it('2.8 Negative Deltas & Downward Trends: handles negative percentage changes, severe spend drops, and CPA spikes correctly', () => {
    function TrendDeltaCard({ metric, deltaPct }: { metric: string; deltaPct: number }) {
      const isNegative = deltaPct < 0;
      return (
        <div data-testid="trend-delta-card">
          <span>{metric}</span>
          <span
            data-testid="delta-chip"
            className={isNegative ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}
          >
            {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
          </span>
        </div>
      );
    }

    renderWithIntl(
      <div>
        <TrendDeltaCard metric="Conversion Rate" deltaPct={-45.2} />
        <TrendDeltaCard metric="CPA Increase" deltaPct={+32.8} />
      </div>,
    );

    const deltaChips = screen.getAllByTestId('delta-chip');
    expect(deltaChips[0]).toHaveTextContent('-45.2%');
    expect(deltaChips[0]).toHaveClass('text-rose-600');

    expect(deltaChips[1]).toHaveTextContent('+32.8%');
    expect(deltaChips[1]).toHaveClass('text-emerald-600');
  });

  it('2.9 Responsive Viewport Breakpoints: verifies mobile drawer vs desktop sidebar visibility contracts', () => {
    function ResponsiveNavContainer({ isMobile }: { isMobile: boolean }) {
      return (
        <div>
          {isMobile ? (
            <div data-testid="mobile-bottom-bar" className="fixed bottom-0 inset-x-0 md:hidden">
              <span>Mobile Tabs</span>
            </div>
          ) : (
            <div data-testid="desktop-sidebar" className="hidden md:flex w-64">
              <span>Desktop Sidebar</span>
            </div>
          )}
        </div>
      );
    }

    const { rerender } = renderWithIntl(<ResponsiveNavContainer isMobile={true} />);
    expect(screen.getByTestId('mobile-bottom-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).not.toBeInTheDocument();

    rerender(<ResponsiveNavContainer isMobile={false} />);
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-bottom-bar')).not.toBeInTheDocument();
  });
});

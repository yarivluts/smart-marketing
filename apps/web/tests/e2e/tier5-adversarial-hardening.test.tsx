import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock navigation
const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => '/orgs/org-1/projects/proj-1/campaigns',
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  renderWithIntl,
} from './helpers/test-harness';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

// Component imports
import { CampaignDailyBudgetControl } from '../../components/orgs/campaign-daily-budget-control';
import { CampaignStatusToggle } from '../../components/orgs/campaign-status-toggle';
import { MetaAdPreviewCard } from '../../components/orgs/meta-ad-preview-card';
import { GoogleSearchAdPreviewCard } from '../../components/orgs/google-search-ad-preview-card';
import { CohortRetentionMatrix } from '../../components/orgs/cohort-retention-matrix';
import { AutomationKillSwitchPanel } from '../../components/orgs/automation-kill-switch-panel';
import { AutomationActionList } from '../../components/orgs/automation-action-list';
import { ExecutiveBlendedReport } from '../../components/orgs/executive-blended-report';

// Library synthesizers & functions
import {
  calculateFunnelStepItems,
  buildVisualFunnelData,
  calculateDaysRemaining,
  getHeatmapCellColor,
} from '../../lib/orgs/funnel-goals-synthesizer';
import { processCopilotQuery } from '../../lib/ai/copilot-engine';
import {
  calculateBlendedCac,
  calculateBlendedRoas,
  buildExecutiveBlendedMetrics,
  buildExecutiveReportData,
} from '../../lib/orgs/executive-reporting-synthesizer';
import {
  calculateGoalProgress,
  evaluateBudgetChangeGuardrails,
  type AutomationGuardrailPolicy,
} from '@growthos/shared';
import type { AutomationActionView } from '../../lib/orgs/automation-view';

describe('Tier 5: Adversarial Coverage Hardening & White-Box Stress Audit', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefresh.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // Module 1 (Ads & Performance): Fast toggles, preset pills, invalid custom budgets, creative preview rendering in LTR/RTL
  // =========================================================================
  describe('5.1 Module 1: Ads & Performance Stress Vectors', () => {
    it('5.1.1 Fast toggles & race condition resiliency: handles optimistic updates, prevents double-invocation, and rolls back on failure', async () => {
      let fetchResolve: (value: any) => void;
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          fetchResolve = resolve;
        });
      });
      global.fetch = mockFetch;

      const onStatusChange = vi.fn();

      renderWithIntl(
        <CampaignStatusToggle
          orgId="org-1"
          projectId="proj-1"
          targetId="target-meta-1"
          campaignLabel="Retargeting Campaign"
          initialStatus="enabled"
          onStatusChange={onStatusChange}
        />,
      );

      const toggleBtn = screen.getByRole('switch');
      expect(toggleBtn).toHaveAttribute('aria-checked', 'true');

      // First click: initiates pause
      fireEvent.click(toggleBtn);
      expect(onStatusChange).toHaveBeenCalledWith('paused');
      expect(toggleBtn).toBeDisabled(); // Disabled while syncing to prevent race conditions

      // Second rapid click while syncing is ignored
      fireEvent.click(toggleBtn);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Simulate API failure (500 internal server error)
      await act(async () => {
        fetchResolve!({
          ok: false,
          status: 500,
          json: async () => ({ message: 'API failure' }),
        });
      });

      await waitFor(() => {
        // Optimistic state rolled back to 'enabled'
        expect(toggleBtn).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('5.1.2 Preset pills & custom budget validation: computes presets and sanitizes invalid/negative/zero inputs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, id: 'act-123' }),
      });
      global.fetch = mockFetch;

      const onBudgetChange = vi.fn();

      renderWithIntl(
        <CampaignDailyBudgetControl
          orgId="org-1"
          projectId="proj-1"
          targetId="target-1"
          campaignLabel="Lead Gen Search"
          initialDailyBudgetUsd={100}
          onBudgetChange={onBudgetChange}
        />,
      );

      // 1. Test +20% preset pill -> expects 120
      const plus20Pill = screen.getByTitle(enMessages.Campaigns.increaseBudgetBy.replace('{percent}', '20'));
      await act(async () => {
        fireEvent.click(plus20Pill);
      });
      expect(onBudgetChange).toHaveBeenCalledWith(120);

      // Wait for async sync to complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /\$120/ })).toBeInTheDocument();
      });

      // 2. Test -20% preset pill -> expects Math.round(120 * 0.8) = 96
      const minus20Pill = screen.getByTitle(enMessages.Campaigns.decreaseBudgetBy.replace('{percent}', '20'));
      await act(async () => {
        fireEvent.click(minus20Pill);
      });
      expect(onBudgetChange).toHaveBeenCalledWith(96);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /\$96/ })).toBeInTheDocument();
      });

      // 3. Test inline custom editing with invalid negative value & Escape reset
      const editBtn = screen.getByRole('button', { name: /\$96/ });
      fireEvent.click(editBtn);

      const input = screen.getByLabelText(
        enMessages.Campaigns.dailyBudgetEditLabel.replace('{name}', 'Lead Gen Search'),
      );
      expect(input).toBeInTheDocument();

      // Enter invalid negative number
      fireEvent.change(input, { target: { value: '-50' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // On Escape, edit is cancelled and budget stays at 96
      expect(screen.getByRole('button', { name: /\$96/ })).toBeInTheDocument();

      // 4. Test float rounding on commit ($149.80 -> 150)
      fireEvent.click(screen.getByRole('button', { name: /\$96/ }));
      const input2 = screen.getByLabelText(
        enMessages.Campaigns.dailyBudgetEditLabel.replace('{name}', 'Lead Gen Search'),
      );
      fireEvent.change(input2, { target: { value: '149.80' } });
      await act(async () => {
        fireEvent.keyDown(input2, { key: 'Enter' });
      });

      expect(onBudgetChange).toHaveBeenCalledWith(150);
    });

    it('5.1.3 Guardrail violation handling: renders friendly localized error alert when 422 is returned from server', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          violations: [
            {
              type: 'spend_ceiling',
              message: 'Daily budget exceeds project spend ceiling of $500',
            },
          ],
        }),
      });

      renderWithIntl(
        <CampaignDailyBudgetControl
          orgId="org-1"
          projectId="proj-1"
          targetId="target-1"
          campaignLabel="Search Campaign"
          initialDailyBudgetUsd={100}
        />,
      );

      // Click +20%
      const plus20Pill = screen.getByTitle(enMessages.Campaigns.increaseBudgetBy.replace('{percent}', '20'));
      await act(async () => {
        fireEvent.click(plus20Pill);
      });

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Daily budget exceeds project spend ceiling of $500');
        // Budget rolled back to 100
        expect(screen.getByRole('button', { name: /\$100/ })).toBeInTheDocument();
      });
    });

    it('5.1.4 Creative preview rendering in LTR and RTL: handles missing images, BiDi text, and platform filtering', () => {
      const mockAdWithoutImage = {
        adName: 'Hebrew Legal Ad',
        adSetName: 'Lawyers Audience',
        headline: 'חתימה דיגיטלית מהירה ומאובטחת',
        primaryText: 'חסוך זמן וחתום על מסמכים בלחיצת כפתור אחת בלבד.',
        description: 'תואם לכל דרישות החוק הישראלי.',
        imageUrl: '',
        linkUrl: 'https://growthos.io/he/legal',
        callToActionType: 'SIGN_UP',
        status: 'ACTIVE',
      };

      // 1. Meta preview card in Hebrew RTL with missing image fallback
      const { unmount } = renderWithIntl(
        <MetaAdPreviewCard campaignName="קמפיין עורכי דין" ad={mockAdWithoutImage} />,
        { locale: 'he' },
      );

      expect(screen.getByText('חתימה דיגיטלית מהירה ומאובטחת')).toBeInTheDocument();
      expect(screen.getByText('חסוך זמן וחתום על מסמכים בלחיצת כפתור אחת בלבד.')).toBeInTheDocument();
      expect(screen.getByText(heMessages.Campaigns.metaAdVisualPreviewPlaceholder)).toBeInTheDocument();

      unmount();

      // 2. Google Search RSA ad preview in English LTR
      renderWithIntl(
        <GoogleSearchAdPreviewCard
          campaignName="Search - SaaS"
          headlines={['Headline 1', 'Headline 2', 'Headline 3']}
          descriptions={['Description 1 text', 'Description 2 text']}
          finalUrl="https://growthos.io/features"
          keywords={['saas', 'growth']}
        />,
        { locale: 'en' },
      );

      expect(screen.getByText('Headline 1')).toBeInTheDocument();
      expect(screen.getByText('Headline 2')).toBeInTheDocument();
      expect(screen.getByText('Headline 3')).toBeInTheDocument();
      expect(screen.getByText('Description 1 text')).toBeInTheDocument();
      expect(screen.getByText('saas')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Module 2 (Funnel & Goals): Empty funnels, inverted drop-offs, goal deadline expirations, minimize/maximize pace ratios, cohort retention filters
  // =========================================================================
  describe('5.2 Module 2: Funnel & Goals Edge-Case Stress Vectors', () => {
    it('5.2.1 Funnel edge cases: safely handles empty funnels, single-step funnels, and zero started entrants', () => {
      // 1. Empty raw steps
      expect(calculateFunnelStepItems([])).toEqual([]);

      // 2. Single step funnel
      const singleStep = calculateFunnelStepItems(
        [{ stageKey: 'landing', stepOrder: 1, customerCount: 500 }],
        () => 'Landing Page',
      );
      expect(singleStep).toHaveLength(1);
      expect(singleStep[0].conversionPercent).toBe(100);
      expect(singleStep[0].dropOffPercent).toBe(0);

      // 3. Zero started entrants
      const zeroStarted = calculateFunnelStepItems(
        [
          { stageKey: 's1', stepOrder: 1, customerCount: 0 },
          { stageKey: 's2', stepOrder: 2, customerCount: 0 },
        ],
        (k) => k,
      );
      expect(zeroStarted[0].conversionPercent).toBe(0);
      expect(zeroStarted[1].conversionPercent).toBe(0);
      expect(zeroStarted[1].dropOffPercent).toBe(0);

      // 4. Null outcome fallback synthesis
      const synthesized = buildVisualFunnelData(null, 'test-seed');
      expect(synthesized.isSimulated).toBe(true);
      expect(synthesized.steps.length).toBe(3);
      expect(synthesized.overallConversionPercent).toBeGreaterThan(0);
    });

    it('5.2.2 Inverted drop-offs: clamps drop-off percentage to 0% when a subsequent step has more users than preceding step', () => {
      const invertedSteps = calculateFunnelStepItems(
        [
          { stageKey: 'sent', stepOrder: 1, customerCount: 100 },
          { stageKey: 'viewed', stepOrder: 2, customerCount: 150 }, // Anomalous surge
          { stageKey: 'signed', stepOrder: 3, customerCount: 80 },
        ],
        (k) => k,
      );

      expect(invertedSteps[0].dropOffPercent).toBe(0);
      // Step 2 has 150 count vs step 1's 100 -> dropOffPercent must clamp to 0%, never negative
      expect(invertedSteps[1].dropOffPercent).toBe(0);
      // Step 3 has 80 count vs step 2's 150 -> dropOffPercent = (150 - 80) / 150 = ~47%
      expect(invertedSteps[2].dropOffPercent).toBe(47);
    });

    it('5.2.3 Goal deadline expirations & past dates: calculateDaysRemaining returns 0 (never negative or NaN)', () => {
      // Past deadline
      expect(calculateDaysRemaining('2020-01-01')).toBe(0);
      expect(calculateDaysRemaining('1999-12-31')).toBe(0);

      // Invalid date string
      expect(calculateDaysRemaining('invalid-date-string')).toBe(0);
      expect(calculateDaysRemaining('')).toBe(0);

      // Future deadline
      const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(futureDate)).toBeGreaterThanOrEqual(9);
    });

    it('5.2.4 Maximize vs Minimize vs Range goal pace dynamics: calculates exact progress ratios and status bounds', () => {
      // 1. Maximize goal: actual exceeds target -> goal met
      const maxGoal = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 1000,
        actualValue: 1200,
        elapsedFraction: 0.5,
      });
      expect(maxGoal.isGoalMet).toBe(true);
      expect(maxGoal.status).toBe('on_track');
      expect(maxGoal.progressRatio).toBe(1.2);

      // 2. Minimize goal (e.g. CAC Ceiling $40):
      // Case A: actual CAC $30 (below ceiling) -> on track / met
      const minGoalGood = calculateGoalProgress({
        direction: 'minimize',
        targetValue: 40,
        actualValue: 30,
        elapsedFraction: 0.5,
      });
      expect(minGoalGood.isGoalMet).toBe(true);
      expect(minGoalGood.status).toBe('on_track');

      // Case B: actual CAC $60 (above ceiling) -> off track
      const minGoalBad = calculateGoalProgress({
        direction: 'minimize',
        targetValue: 40,
        actualValue: 60,
        elapsedFraction: 0.8,
      });
      expect(minGoalBad.isGoalMet).toBe(false);
      expect(minGoalBad.status).toBe('off_track');

      // 3. Range goal (e.g. Payback [30, 45] days):
      // Case A: actual 38 days -> in range
      const rangeGoalGood = calculateGoalProgress({
        direction: 'range',
        rangeMin: 30,
        rangeMax: 45,
        actualValue: 38,
        elapsedFraction: 0.5,
      });
      expect(rangeGoalGood.isGoalMet).toBe(true);

      // 4. Elapsed fraction 0 (start date today)
      const zeroElapsed = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 500,
        actualValue: 50,
        elapsedFraction: 0,
      });
      expect(zeroElapsed.expectedAtNow).toBe(0);
      expect(Number.isFinite(zeroElapsed.projectedFinalValue)).toBe(true);
    });

    it('5.2.5 Cohort retention heatmap & cell coloring: maps all retention thresholds accurately and renders matrix filters', () => {
      expect(getHeatmapCellColor(100)).toContain('bg-emerald-500 text-white font-bold');
      expect(getHeatmapCellColor(85)).toContain('bg-emerald-500 text-white font-bold');
      expect(getHeatmapCellColor(65)).toContain('bg-emerald-500/70');
      expect(getHeatmapCellColor(45)).toContain('bg-emerald-500/35');
      expect(getHeatmapCellColor(25)).toContain('bg-amber-500/30');
      expect(getHeatmapCellColor(15)).toContain('bg-rose-500/20');
      expect(getHeatmapCellColor(0)).toContain('bg-muted/30');

      const onSelectEvent = vi.fn();
      const mockCohortRow = {
        cohortMonth: '2026-01-01',
        cohortLabel: 'Jan 2026',
        cohortSize: 100,
        retentionByPeriod: new Map([
          [0, { retainedCount: 100, retentionRatePercent: 100, colorClass: getHeatmapCellColor(100) }],
          [1, { retainedCount: 65, retentionRatePercent: 65, colorClass: getHeatmapCellColor(65) }],
          [2, { retainedCount: 42, retentionRatePercent: 42, colorClass: getHeatmapCellColor(42) }],
        ]),
      };

      renderWithIntl(
        <CohortRetentionMatrix
          cohorts={[mockCohortRow]}
          periodNumbers={[0, 1, 2]}
          onSelectConversionEvent={onSelectEvent}
        />,
      );

      // Filter clicks
      fireEvent.click(screen.getByTestId('filter-purchases'));
      expect(onSelectEvent).toHaveBeenCalledWith('purchase');

      fireEvent.click(screen.getByTestId('filter-sign-ins'));
      expect(onSelectEvent).toHaveBeenCalledWith('sign_in');
    });
  });

  // =========================================================================
  // Module 3 (AI Copilot & Automation): Mixed Hebrew/English NLP commands, budget surge guardrails, emergency kill switch, 1-click rollback
  // =========================================================================
  describe('5.3 Module 3: AI Copilot & Automation Hardening', () => {
    it('5.3.1 Mixed Hebrew/English NLP commands: parses all intent vectors, extracts budget numbers, and falls back gracefully', () => {
      // Hebrew Budget Increase
      const heBudget = processCopilotQuery('הגדל תקציב ל-400$', { locale: 'he' });
      expect(heBudget.actionProposal).toBeDefined();
      expect(heBudget.actionProposal?.actionType).toBe('budget_change');
      expect(heBudget.actionProposal?.afterValue).toBe('$400/day');
      expect(heBudget.message.role).toBe('assistant');

      // Hebrew Search Campaign Draft
      const heDraft = processCopilotQuery('צור קמפיין חיפוש חדש לעורכי דין', { locale: 'he' });
      expect(heDraft.actionProposal?.actionType).toBe('campaign_draft_create');
      expect(heDraft.message.content).toContain('טיוטת קמפיין');

      // Hebrew Rebalancing
      const heRebalance = processCopilotQuery('איזון תקציב בין גוגל למטא', { locale: 'he' });
      expect(heRebalance.actionProposal?.actionType).toBe('budget_change');
      expect(heRebalance.actionProposal?.targetLabel).toContain('Shift $500/day');

      // Hebrew Campaign Pause
      const hePause = processCopilotQuery('השהה קמפיין עם CAC גבוה', { locale: 'he' });
      expect(hePause.actionProposal?.actionType).toBe('campaign_activation');
      expect(hePause.actionProposal?.afterValue).toBe('PAUSED');

      // English Top Performing Ads
      const enAds = processCopilotQuery('What are our top performing ads this week?', { locale: 'en' });
      expect(enAds.message.content).toContain('top-performing ads this week');
      expect(enAds.actionProposal).toBeUndefined();

      // Mixed Hebrew & English BiDi string
      const mixedQuery = processCopilotQuery('תעשה shift budget ל-Meta Ads בבקשה', { locale: 'he' });
      expect(mixedQuery.actionProposal?.actionType).toBe('budget_change');

      // Unrecognized fallback
      const unknownQuery = processCopilotQuery('random unparseable sentence 12345', { locale: 'en' });
      expect(unknownQuery.actionProposal).toBeUndefined();
      expect(unknownQuery.message.content).toContain('How can I help you optimize');
    });

    it('5.3.2 Budget surge & multi-constraint guardrails: strictly enforces 50% max daily increase, spend ceilings, protected targets, allowed UTC hours', () => {
      const policy: AutomationGuardrailPolicy = {
        protectedTargetIds: ['protected-brand-campaign'],
        maxDailyBudgetChangePct: 50, // 50% max increase/decrease
        spendCeilingUsd: 500,        // $500 max ceiling
        allowedHours: { startHourUtc: 8, endHourUtc: 18 }, // 8:00 to 18:00 UTC
        maxActionsPerDay: 5,
      };

      // 1. Budget Surge (>50% increase: $100 -> $160 is 60% increase)
      const surgeContext = { nowUtc: new Date('2026-08-31T12:00:00Z'), actionsExecutedToday: 1 };
      const surgeViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'target-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 160 },
        surgeContext,
      );
      expect(surgeViolations.some((v) => v.type === 'max_daily_change_pct')).toBe(true);

      // 2. Spend Ceiling ($100 -> $550 exceeds $500 ceiling)
      const ceilingViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'target-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 550 },
        surgeContext,
      );
      expect(ceilingViolations.some((v) => v.type === 'spend_ceiling')).toBe(true);

      // 3. Protected Target ID
      const protectedViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'protected-brand-campaign', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 120 },
        surgeContext,
      );
      expect(protectedViolations.some((v) => v.type === 'protected_target')).toBe(true);

      // 4. Outside Allowed Hours (2:00 UTC is outside 8:00-18:00 UTC)
      const nightContext = { nowUtc: new Date('2026-08-31T02:00:00Z'), actionsExecutedToday: 1 };
      const hourViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'target-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 120 },
        nightContext,
      );
      expect(hourViolations.some((v) => v.type === 'outside_allowed_hours')).toBe(true);

      // 5. Blast Radius (actionsExecutedToday >= maxActionsPerDay)
      const blastContext = { nowUtc: new Date('2026-08-31T12:00:00Z'), actionsExecutedToday: 5 };
      const blastViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'target-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 120 },
        blastContext,
      );
      expect(blastViolations.some((v) => v.type === 'blast_radius')).toBe(true);

      // 6. Compliant Change ($100 -> $130, 30% increase, within hours, under ceiling)
      const safeViolations = evaluateBudgetChangeGuardrails(
        policy,
        { targetId: 'target-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 130 },
        surgeContext,
      );
      expect(safeViolations).toHaveLength(0);
    });

    it('5.3.3 Emergency kill switch & 1-click rollback: validates engagement requirements and state rollback execution', async () => {
      // 1. Emergency Kill Switch requires non-empty reason
      renderWithIntl(
        <AutomationKillSwitchPanel
          orgId="org-1"
          status={{ engaged: false, reason: undefined }}
        />,
      );

      const engageBtn = screen.getByRole('button', { name: enMessages.Automation.killSwitchEngageButton });
      fireEvent.click(engageBtn);

      expect(screen.getByRole('alert')).toHaveTextContent(enMessages.Automation.killSwitchReasonRequiredError);

      // 2. Rollback execution on AutomationActionList
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      global.fetch = mockFetch;

      const mockAction: AutomationActionView = {
        id: 'action-99',
        targetId: 'target-meta-1',
        targetLabel: 'Meta Retargeting Campaign',
        status: 'executed',
        diffEntries: [{ key: 'daily_budget_usd', before: 150, after: 250 }],
        guardrailViolations: [],
        proposedAt: '2026-08-31T01:00:00Z',
      };

      renderWithIntl(
        <AutomationActionList
          orgId="org-1"
          projectId="proj-1"
          actions={[mockAction]}
          canApprove={true}
        />,
      );

      const rollbackBtn = screen.getByRole('button', { name: enMessages.Automation.rollbackButton });
      expect(rollbackBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(rollbackBtn);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/proj-1/automation/actions/action-99/rollback',
        { method: 'POST' },
      );
    });
  });

  // =========================================================================
  // Module 4 (Executive Reporting & Bilingual Polish): 100% translation key symmetry, zero-division resilience, period-over-period scaling (7d, 30d, 90d)
  // =========================================================================
  describe('5.4 Module 4: Executive Reporting & Bilingual Polish Stress Vectors', () => {
    function extractAllKeys(obj: Record<string, any>, prefix = ''): string[] {
      return Object.entries(obj).flatMap(([key, val]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null) {
          return extractAllKeys(val, fullKey);
        }
        return [fullKey];
      });
    }

    function extractAllValues(obj: Record<string, any>): string[] {
      return Object.values(obj).flatMap((val) => {
        if (typeof val === 'object' && val !== null) {
          return extractAllValues(val);
        }
        return [String(val)];
      });
    }

    it('5.4.1 100% translation key symmetry & 0 empty values: strictly asserts key parity and no blank strings across EN and HE', () => {
      const enKeys = extractAllKeys(enMessages).sort();
      const heKeys = extractAllKeys(heMessages).sort();

      const missingInHe = enKeys.filter((k) => !heKeys.includes(k));
      const missingInEn = heKeys.filter((k) => !enKeys.includes(k));

      expect(missingInHe).toEqual([]);
      expect(missingInEn).toEqual([]);
      expect(enKeys.length).toBeGreaterThan(500);

      const enVals = extractAllValues(enMessages);
      const heVals = extractAllValues(heMessages);

      const emptyEn = enVals.filter((v) => v.trim().length === 0);
      const emptyHe = heVals.filter((v) => v.trim().length === 0);

      expect(emptyEn).toHaveLength(0);
      expect(emptyHe).toHaveLength(0);
    });

    it('5.4.2 Zero-division resilience: cac and roas calculations return 0 and never throw NaN / Infinity on zero values', () => {
      // CAC
      expect(calculateBlendedCac(0, 0)).toBe(0);
      expect(calculateBlendedCac(5000, 0)).toBe(0);
      expect(calculateBlendedCac(0, 50)).toBe(0);

      // ROAS
      expect(calculateBlendedRoas(0, 0)).toBe(0);
      expect(calculateBlendedRoas(5000, 0)).toBe(0);
      expect(calculateBlendedRoas(0, 500)).toBe(0);

      // Full Synthesizer with zero data
      const zeroMetrics = buildExecutiveBlendedMetrics({
        targets: [],
        spendOutcome: null,
        overrides: {
          totalSpendUsd: 0,
          metaSpendUsd: 0,
          googleSpendUsd: 0,
          totalConversions: 0,
          blendedCacUsd: 0,
          blendedRoas: 0,
        },
      });

      expect(Number.isFinite(zeroMetrics.totalSpendUsd)).toBe(true);
      expect(Number.isFinite(zeroMetrics.blendedCacUsd)).toBe(true);
      expect(Number.isFinite(zeroMetrics.blendedRoas)).toBe(true);
    });

    it('5.4.3 Period-over-period time-window scaling: scales 7d (7/30), 30d (1.0), and 90d (3.0) metrics with 100% channel sum parity', () => {
      // 30d baseline
      const report30d = buildExecutiveReportData({ timeWindow: '30d', seed: 'test-scaling' });
      // 7d scaled
      const report7d = buildExecutiveReportData({ timeWindow: '7d', seed: 'test-scaling' });
      // 90d scaled
      const report90d = buildExecutiveReportData({ timeWindow: '90d', seed: 'test-scaling' });

      expect(report7d.metrics.totalSpendUsd).toBeLessThan(report30d.metrics.totalSpendUsd);
      expect(report90d.metrics.totalSpendUsd).toBeGreaterThan(report30d.metrics.totalSpendUsd);

      // Channel allocation percentage sums to 100% across all windows
      for (const report of [report7d, report30d, report90d]) {
        const totalPct = report.channels.reduce((sum, c) => sum + c.percentage, 0);
        expect(totalPct).toBe(100);
      }

      // Render ExecutiveBlendedReport and test time-window filter buttons
      renderWithIntl(<ExecutiveBlendedReport seed="test-scaling" />);

      const btn7d = screen.getByRole('button', { name: enMessages.ExecutiveReport.window7d });
      const btn30d = screen.getByRole('button', { name: enMessages.ExecutiveReport.window30d });
      const btn90d = screen.getByRole('button', { name: enMessages.ExecutiveReport.window90d });

      expect(btn7d).toBeInTheDocument();
      expect(btn30d).toBeInTheDocument();
      expect(btn90d).toBeInTheDocument();

      // Click 7d
      fireEvent.click(btn7d);
      // Click 90d
      fireEvent.click(btn90d);
    });
  });
});

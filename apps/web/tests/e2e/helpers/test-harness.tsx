import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../../messages/en.json';
import heMessages from '../../../messages/he.json';

import type {
  CopilotActionProposal,
  CopilotMessage,
  SmartRecommendationCardProps,
  ExecutiveBlendedMetrics,
} from '@/lib/ai/copilot-types';

export type {
  CopilotActionProposal,
  CopilotMessage,
  SmartRecommendationCardProps,
  ExecutiveBlendedMetrics,
};


export interface RenderOptions {
  locale?: 'en' | 'he';
  messages?: Record<string, any>;
}

export function renderWithIntl(
  ui: React.ReactElement,
  options: RenderOptions = {},
): RenderResult {
  const locale = options.locale ?? 'en';
  const messages = options.messages ?? (locale === 'he' ? heMessages : enMessages);

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export interface MockCampaign {
  id: string;
  name: string;
  platform: 'meta' | 'google_ads';
  status: 'ENABLED' | 'PAUSED';
  dailyBudgetUsd: number;
  spendUsd: number;
  conversions: number;
  revenueUsd: number;
  roas: number;
  targetId: string;
}

export function createMockCampaign(overrides: Partial<MockCampaign> = {}): MockCampaign {
  return {
    id: 'camp-1',
    name: 'Retargeting - High Intent Leads',
    platform: 'meta',
    status: 'ENABLED',
    dailyBudgetUsd: 150,
    spendUsd: 450,
    conversions: 18,
    revenueUsd: 1890,
    roas: 4.2,
    targetId: 'target-meta-1',
    ...overrides,
  };
}

export interface MockFunnelStep {
  stageKey: string;
  stageLabel: string;
  stepOrder: number;
  customerCount: number;
  conversionPercent: number;
  dropOffPercent: number;
}

export function createMockEasySignFunnel(): MockFunnelStep[] {
  return [
    {
      stageKey: 'sent',
      stageLabel: 'Document Sent',
      stepOrder: 1,
      customerCount: 1000,
      conversionPercent: 100,
      dropOffPercent: 0,
    },
    {
      stageKey: 'viewed',
      stageLabel: 'Document Viewed',
      stepOrder: 2,
      customerCount: 380,
      conversionPercent: 38,
      dropOffPercent: 62,
    },
    {
      stageKey: 'signed',
      stageLabel: 'Document Signed',
      stepOrder: 3,
      customerCount: 220,
      conversionPercent: 22,
      dropOffPercent: 42,
    },
  ];
}

export interface MockGoal {
  id: string;
  name: string;
  direction: 'maximize' | 'minimize' | 'range';
  targetValue: number;
  actualValue: number;
  startDate: string;
  deadline: string;
  projectedFinalValue: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  progressRatio: number;
}

export function createMockGoal(overrides: Partial<MockGoal> = {}): MockGoal {
  return {
    id: 'goal-1',
    name: 'Q3 Qualified Conversions',
    direction: 'maximize',
    targetValue: 500,
    actualValue: 320,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    projectedFinalValue: 520,
    status: 'on_track',
    progressRatio: 0.64,
    ...overrides,
  };
}

export function createMockCopilotProposal(
  overrides: Partial<CopilotActionProposal> = {},
): CopilotActionProposal {
  return {
    actionType: 'budget_change',
    targetId: 'target-meta-1',
    targetLabel: 'Meta Retargeting Leads',
    beforeValue: '$150/day',
    afterValue: '$250/day',
    estimatedImpact: '+32% projected conversions at $22 CPA',
    impactBadge: 'high',
    payload: {
      dailyBudgetUsd: 250,
      targetId: 'target-meta-1',
    },
    quickExecuteToken: 'token-abc-123',
    ...overrides,
  };
}

export function createMockCopilotMessage(
  overrides: Partial<CopilotMessage> = {},
): CopilotMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Found 1 high-performing campaign with budget headroom.',
    timestamp: '2026-08-30T20:00:00Z',
    actionProposal: createMockCopilotProposal(),
    ...overrides,
  };
}

export function createMockExecutiveMetrics(
  overrides: Partial<ExecutiveBlendedMetrics> = {},
): ExecutiveBlendedMetrics {
  return {
    totalSpendUsd: 14250,
    metaSpendUsd: 8500,
    googleSpendUsd: 5750,
    blendedCacUsd: 47.5,
    blendedRoas: 3.4,
    totalConversions: 300,
    conversionVelocityDays: 4.2,
    churnRatePct: 2.1,
    dunningRecoveryRatePct: 78.5,
    periodComparison: {
      spendChangePct: 12.4,
      cacChangePct: -8.5,
      roasChangePct: 15.2,
    },
    ...overrides,
  };
}

export interface MockAuditEntry {
  id: string;
  actionId: string;
  actionType: string;
  targetId: string;
  targetLabel: string;
  status: string;
  executedAt: string;
  beforeDailyBudgetUsd: number;
  afterDailyBudgetUsd: number;
  diff: {
    before: { dailyBudgetUsd: number };
    after: { dailyBudgetUsd: number };
  };
  canRollback: boolean;
}

export function createMockAuditEntry(overrides: Partial<MockAuditEntry> = {}): MockAuditEntry {
  return {
    id: 'audit-1',
    actionId: 'action-123',
    actionType: 'budget_change',
    targetId: 'target-meta-1',
    targetLabel: 'Meta Retargeting Campaign',
    status: 'executed',
    executedAt: '2026-08-30T20:05:00Z',
    beforeDailyBudgetUsd: 150,
    afterDailyBudgetUsd: 250,
    diff: {
      before: { dailyBudgetUsd: 150 },
      after: { dailyBudgetUsd: 250 },
    },
    canRollback: true,
    ...overrides,
  };
}

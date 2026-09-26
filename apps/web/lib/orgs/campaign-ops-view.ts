import type { CampaignPaybackRow, CampaignSpendRow, CampaignSpendStatus, QualityCalibrationTierRow } from '@growthos/firebase-orm-models';
import type { VizStatus } from '@/components/viz/palette';

/** Translation key for a campaign spend row's red/green/gray status — the AC's own "driving red/green in campaign tables". */
export function campaignSpendStatusLabelKey(status: CampaignSpendStatus): string {
  switch (status) {
    case 'over_target':
      return 'statusOverTarget';
    case 'on_target':
      return 'statusOnTarget';
    case 'no_target':
      return 'statusNoTarget';
    case 'no_spend_data':
      return 'statusNoSpendData';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unknown campaign spend status "${exhaustive as string}".`);
    }
  }
}

/** The viz status (badge/dot colour) a spend row renders with: over target is red, on target green, the rest neutral. */
export function campaignSpendStatusTone(status: CampaignSpendStatus): VizStatus {
  return status === 'over_target' ? 'error' : status === 'on_target' ? 'ok' : 'idle';
}

export interface SpendTargetSummary {
  campaigns: number;
  /** Sum of measured spend; null when no row carries a measurement. */
  totalSpend: number | null;
  byStatus: Record<CampaignSpendStatus, number>;
}

export function summariseSpendTargets(rows: readonly CampaignSpendRow[]): SpendTargetSummary {
  const byStatus: Record<CampaignSpendStatus, number> = { over_target: 0, on_target: 0, no_target: 0, no_spend_data: 0 };
  let totalSpend: number | null = null;
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.actualSpend !== null) totalSpend = (totalSpend ?? 0) + row.actualSpend;
  }
  return { campaigns: rows.length, totalSpend, byStatus };
}

/**
 * How far a campaign's measured spend is through its target, as a percentage (may exceed 100).
 * Null when there is no target, no measurement, or a zero target (nothing to divide by).
 */
export function spendTargetProgressPct(row: CampaignSpendRow): number | null {
  if (row.actualSpend === null || row.monthlyBudget === null || row.monthlyBudget <= 0) return null;
  return Math.round((row.actualSpend / row.monthlyBudget) * 100);
}

type Outcome<T> = ({ ok: true } & T) | { ok: false };

export interface CampaignOpsFlowInput {
  packInstalled: boolean;
  spend: Outcome<{ rows: readonly CampaignSpendRow[] }>;
  payback: Outcome<{ windows: readonly { windowDays: number; collectedRevenue: number }[] }> | null;
  campaignPayback: Outcome<{ rows: readonly CampaignPaybackRow[] }> | null;
  calibration: Outcome<{ tiers: readonly QualityCalibrationTierRow[] }> | null;
}

export type CampaignOpsStage = 'spend' | 'targets' | 'acquisitions' | 'payback' | 'roi' | 'calibration';

export interface CampaignOpsFlowNode {
  stage: CampaignOpsStage;
  status: VizStatus;
  /** The `CampaignOps` translation key for the node's state line. */
  stateKey: string;
  /** The node's headline number, unformatted; absent when there is nothing measured. */
  value?: number;
}

/**
 * The ops board as a flow: spend feeds the budget targets and ROI, attributed acquisitions feed
 * the payback windows, ROI and quality calibration. Every node's colour comes from the outcome
 * the page actually loaded - `idle` when the pack is not installed or nothing has landed, `warn`
 * when the warehouse could not answer - never from an assumption.
 */
export function buildCampaignOpsFlow(input: CampaignOpsFlowInput): CampaignOpsFlowNode[] {
  const packStage = <T,>(stage: CampaignOpsStage, outcome: Outcome<T> | null, measure: (value: T) => number | null): CampaignOpsFlowNode => {
    if (!input.packInstalled || outcome === null) return { stage, status: 'idle', stateKey: 'flowPackNotInstalled' };
    if (!outcome.ok) return { stage, status: 'warn', stateKey: 'flowUnavailable' };
    const value = measure(outcome as unknown as T);
    return value === null ? { stage, status: 'idle', stateKey: 'flowNothingLanded' } : { stage, status: 'ok', stateKey: `flowState.${stage}`, value };
  };

  const spendSummary = input.spend.ok ? summariseSpendTargets(input.spend.rows) : null;
  const spend: CampaignOpsFlowNode =
    spendSummary === null
      ? { stage: 'spend', status: 'warn', stateKey: 'flowUnavailable' }
      : spendSummary.totalSpend === null
        ? { stage: 'spend', status: 'idle', stateKey: 'flowNothingLanded' }
        : { stage: 'spend', status: 'ok', stateKey: 'flowState.spend', value: spendSummary.totalSpend };
  const targeted = spendSummary ? spendSummary.byStatus.over_target + spendSummary.byStatus.on_target : 0;
  const targets: CampaignOpsFlowNode = !spendSummary
    ? { stage: 'targets', status: 'warn', stateKey: 'flowUnavailable' }
    : targeted === 0
      ? { stage: 'targets', status: 'idle', stateKey: 'flowNoTargets' }
      : { stage: 'targets', status: spendSummary.byStatus.over_target > 0 ? 'error' : 'ok', stateKey: spendSummary.byStatus.over_target > 0 ? 'flowOverTarget' : 'flowAllOnTarget', value: spendSummary.byStatus.over_target };

  const acquisitions = packStage<{ rows: readonly CampaignPaybackRow[] }>('acquisitions', input.campaignPayback, (value) => (value.rows.length > 0 ? value.rows.length : null));
  const payback = packStage<{ windows: readonly { windowDays: number; collectedRevenue: number }[] }>('payback', input.payback, (value) => {
    const longest = [...value.windows].sort((a, b) => b.windowDays - a.windowDays)[0];
    return longest ? longest.collectedRevenue : null;
  });
  const roi = packStage<{ rows: readonly CampaignPaybackRow[] }>('roi', input.campaignPayback, (value) => {
    const measured = value.rows.filter((row) => row.roi40d !== null).length;
    return measured > 0 ? measured : null;
  });
  const calibration = packStage<{ tiers: readonly QualityCalibrationTierRow[] }>('calibration', input.calibration, (value) => {
    const signups = value.tiers.reduce((sum, tier) => sum + tier.signups, 0);
    return signups > 0 ? signups : null;
  });
  return [spend, targets, acquisitions, payback, roi, calibration];
}

export const CAMPAIGN_OPS_FLOW_EDGES: readonly { source: CampaignOpsStage; target: CampaignOpsStage }[] = [
  { source: 'spend', target: 'targets' },
  { source: 'spend', target: 'roi' },
  { source: 'acquisitions', target: 'payback' },
  { source: 'payback', target: 'roi' },
  { source: 'acquisitions', target: 'calibration' },
];

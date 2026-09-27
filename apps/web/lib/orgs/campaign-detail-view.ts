import type { AutomationActionStatus } from '@growthos/firebase-orm-models';
import type { VizStatus } from '@/components/viz/palette';

/** The minimum of an automation action this view needs - plain data, so it is testable without a model. */
export interface CampaignLifecycleAction {
  actionType: string;
  status: AutomationActionStatus;
  proposedAt: string;
}

export type CampaignLifecycleStage = 'draft' | 'activation' | 'live' | 'sync' | 'spend';

export interface CampaignLifecycleNode {
  stage: CampaignLifecycleStage;
  status: VizStatus;
  /** The `Campaigns` translation key for this node's state line. */
  stateKey: string;
  /** An ISO timestamp to show under the state, when the stage has one. */
  at?: string;
}

export interface CampaignLifecycleInput {
  actions: readonly CampaignLifecycleAction[];
  campaignStatus?: 'enabled' | 'paused' | 'removed' | string;
  /** Present when a platform read has recorded this campaign's state. */
  lastReadStateAt?: string;
  /** Days with a spend row, and their total; null when spend could not be queried. */
  spend: { days: number; totalUsd: number } | null;
}

const IN_FLIGHT: readonly AutomationActionStatus[] = ['proposed', 'awaiting_approval', 'approved'];
const DONE: readonly AutomationActionStatus[] = ['executed', 'verified'];
const STOPPED: readonly AutomationActionStatus[] = ['blocked', 'rejected', 'failed', 'rolled_back'];

function latest(actions: readonly CampaignLifecycleAction[], actionType: string): CampaignLifecycleAction | undefined {
  return actions.filter((action) => action.actionType === actionType).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))[0];
}

function actionStage(stage: CampaignLifecycleStage, action: CampaignLifecycleAction | undefined): CampaignLifecycleNode {
  if (!action) return { stage, status: 'idle', stateKey: `lifecycle.${stage}.none` };
  if (DONE.includes(action.status)) return { stage, status: 'ok', stateKey: `lifecycle.${stage}.done`, at: action.proposedAt };
  if (IN_FLIGHT.includes(action.status)) return { stage, status: 'warn', stateKey: `lifecycle.${stage}.pending`, at: action.proposedAt };
  if (STOPPED.includes(action.status)) return { stage, status: 'error', stateKey: `lifecycle.${stage}.stopped`, at: action.proposedAt };
  return { stage, status: 'idle', stateKey: `lifecycle.${stage}.none` };
}

/**
 * A campaign's path from draft to spend, one node per stage, each coloured by what actually happened:
 * the latest draft and activation actions, the target's recorded status, whether a platform read
 * has confirmed that status, and whether the warehouse has measured any spend. A stage with no
 * evidence is idle, never assumed done.
 */
export function buildCampaignLifecycle(input: CampaignLifecycleInput): CampaignLifecycleNode[] {
  const draft = actionStage('draft', latest(input.actions, 'campaign_draft_create'));
  const activation = actionStage('activation', latest(input.actions, 'campaign_activation'));
  const live: CampaignLifecycleNode =
    input.campaignStatus === 'enabled'
      ? { stage: 'live', status: 'ok', stateKey: 'lifecycle.live.enabled' }
      : input.campaignStatus === 'paused'
        ? { stage: 'live', status: 'warn', stateKey: 'lifecycle.live.paused' }
        : input.campaignStatus === 'removed'
          ? { stage: 'live', status: 'error', stateKey: 'lifecycle.live.removed' }
          : { stage: 'live', status: 'idle', stateKey: 'lifecycle.live.none' };
  const sync: CampaignLifecycleNode = input.lastReadStateAt
    ? { stage: 'sync', status: 'ok', stateKey: 'lifecycle.sync.done', at: input.lastReadStateAt }
    : { stage: 'sync', status: 'idle', stateKey: 'lifecycle.sync.none' };
  const spend: CampaignLifecycleNode =
    input.spend === null
      ? { stage: 'spend', status: 'idle', stateKey: 'lifecycle.spend.unavailable' }
      : input.spend.days > 0 && input.spend.totalUsd > 0
        ? { stage: 'spend', status: 'ok', stateKey: 'lifecycle.spend.measured' }
        : { stage: 'spend', status: 'idle', stateKey: 'lifecycle.spend.none' };
  return [draft, activation, live, sync, spend];
}

export interface SpendDay {
  date: string;
  spendUsd: number;
}

export interface SpendTrendSummary {
  totalUsd: number;
  avgDailyUsd: number;
  peak: SpendDay;
  /** Days that carried a non-zero spend. */
  activeDays: number;
}

/** Totals over the days the warehouse returned. Null when it returned none. */
export function summariseSpendDays(days: readonly SpendDay[]): SpendTrendSummary | null {
  if (days.length === 0) return null;
  const totalUsd = days.reduce((sum, day) => sum + day.spendUsd, 0);
  const peak = days.reduce((best, day) => (day.spendUsd > best.spendUsd ? day : best));
  return { totalUsd, avgDailyUsd: totalUsd / days.length, peak, activeDays: days.filter((day) => day.spendUsd > 0).length };
}

/** How many of a campaign's actions ended in each status, most frequent first. */
export function countActionsByStatus(actions: readonly { status: AutomationActionStatus }[]): { status: AutomationActionStatus; count: number }[] {
  const counts = new Map<AutomationActionStatus, number>();
  for (const action of actions) counts.set(action.status, (counts.get(action.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

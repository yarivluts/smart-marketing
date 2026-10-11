import { describe, expect, it } from 'vitest';
import type { CampaignSpendRow } from '@growthos/firebase-orm-models';
import { buildCampaignOpsFlow, campaignSpendStatusLabelKey, campaignSpendStatusTone, spendTargetProgressPct, summariseSpendTargets } from './campaign-ops-view';

describe('campaignSpendStatusLabelKey', () => {
  it.each([
    ['over_target', 'statusOverTarget'],
    ['on_target', 'statusOnTarget'],
    ['no_target', 'statusNoTarget'],
  ] as const)('maps %s -> %s', (status, expected) => {
    expect(campaignSpendStatusLabelKey(status)).toBe(expected);
  });
});

describe('campaignSpendStatusTone', () => {
  it('is red over target, green on target and neutral otherwise', () => {
    expect(campaignSpendStatusTone('over_target')).toBe('error');
    expect(campaignSpendStatusTone('on_target')).toBe('ok');
    expect(campaignSpendStatusTone('no_target')).toBe('idle');
    expect(campaignSpendStatusTone('no_spend_data')).toBe('idle');
  });
});

const rows: CampaignSpendRow[] = [
  { campaignId: 'a', actualSpend: 150, monthlyBudget: 100, status: 'over_target' },
  { campaignId: 'b', actualSpend: 50, monthlyBudget: 100, status: 'on_target' },
  { campaignId: 'c', actualSpend: 20, monthlyBudget: null, status: 'no_target' },
];

describe('summariseSpendTargets', () => {
  it('counts statuses and sums measured spend', () => {
    expect(summariseSpendTargets(rows)).toEqual({
      campaigns: 3,
      totalSpend: 220,
      byStatus: { over_target: 1, on_target: 1, no_target: 1, no_spend_data: 0 },
    });
  });

  it('keeps the total null when nothing is measured', () => {
    expect(summariseSpendTargets([{ campaignId: 'a', actualSpend: null, monthlyBudget: 100, status: 'no_spend_data' }]).totalSpend).toBeNull();
  });
});

describe('spendTargetProgressPct', () => {
  it('is spend over target, and null without a target, a measurement or a positive target', () => {
    expect(spendTargetProgressPct(rows[0])).toBe(150);
    expect(spendTargetProgressPct(rows[2])).toBeNull();
    expect(spendTargetProgressPct({ campaignId: 'x', actualSpend: null, monthlyBudget: 10, status: 'no_spend_data' })).toBeNull();
    expect(spendTargetProgressPct({ campaignId: 'x', actualSpend: 5, monthlyBudget: 0, status: 'over_target' })).toBeNull();
  });
});

describe('buildCampaignOpsFlow', () => {
  it('marks pack stages idle when the pack is not installed and spend as unavailable when the query failed', () => {
    const flow = buildCampaignOpsFlow({ packInstalled: false, spend: { ok: false }, payback: null, campaignPayback: null, calibration: null });
    expect(flow.map((node) => [node.stage, node.status, node.stateKey])).toEqual([
      ['spend', 'warn', 'flowUnavailable'],
      ['targets', 'warn', 'flowUnavailable'],
      ['acquisitions', 'idle', 'flowPackNotInstalled'],
      ['payback', 'idle', 'flowPackNotInstalled'],
      ['roi', 'idle', 'flowPackNotInstalled'],
      ['calibration', 'idle', 'flowPackNotInstalled'],
    ]);
  });

  it('carries measured values and flags campaigns over target', () => {
    const flow = buildCampaignOpsFlow({
      packInstalled: true,
      spend: { ok: true, rows },
      payback: {
        ok: true,
        windows: [
          { windowDays: 7, collectedRevenue: 10 },
          { windowDays: 40, collectedRevenue: 90 },
        ],
      },
      campaignPayback: {
        ok: true,
        rows: [
          { campaignId: 'a', collectedRevenue40d: 60, roi40d: 0.4 },
          { campaignId: 'b', collectedRevenue40d: 30, roi40d: null },
        ],
      },
      calibration: { ok: false },
    });
    const byStage = Object.fromEntries(flow.map((node) => [node.stage, node]));
    expect(byStage.spend).toMatchObject({ status: 'ok', value: 220 });
    expect(byStage.targets).toMatchObject({ status: 'error', stateKey: 'flowOverTarget', value: 1 });
    expect(byStage.acquisitions).toMatchObject({ status: 'ok', value: 2 });
    expect(byStage.payback).toMatchObject({ status: 'ok', value: 90 });
    expect(byStage.roi).toMatchObject({ status: 'ok', value: 1 });
    expect(byStage.calibration).toMatchObject({ status: 'warn', stateKey: 'flowUnavailable' });
  });

  it('reads an installed pack with nothing landed as idle, not as zero', () => {
    const flow = buildCampaignOpsFlow({
      packInstalled: true,
      spend: { ok: true, rows: [] },
      payback: { ok: true, windows: [] },
      campaignPayback: { ok: true, rows: [] },
      calibration: { ok: true, tiers: [] },
    });
    expect(flow.every((node) => node.status === 'idle')).toBe(true);
    expect(flow.find((node) => node.stage === 'targets')?.stateKey).toBe('flowNoTargets');
  });
});

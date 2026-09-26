import { describe, expect, it } from 'vitest';
import { buildCampaignLifecycle, countActionsByStatus, summariseSpendDays } from './campaign-detail-view';

describe('buildCampaignLifecycle', () => {
  it('marks every stage idle when nothing has happened, never assumed done', () => {
    const nodes = buildCampaignLifecycle({ actions: [], spend: null });
    expect(nodes.map((node) => [node.stage, node.status, node.stateKey])).toEqual([
      ['draft', 'idle', 'lifecycle.draft.none'],
      ['activation', 'idle', 'lifecycle.activation.none'],
      ['live', 'idle', 'lifecycle.live.none'],
      ['sync', 'idle', 'lifecycle.sync.none'],
      ['spend', 'idle', 'lifecycle.spend.unavailable'],
    ]);
  });

  it('reads each stage from the latest matching action, the recorded status, the sync time and spend', () => {
    const nodes = buildCampaignLifecycle({
      actions: [
        { actionType: 'campaign_draft_create', status: 'executed', proposedAt: '2026-08-01T00:00:00Z' },
        { actionType: 'campaign_activation', status: 'executed', proposedAt: '2026-08-02T00:00:00Z' },
        // The newer activation was rolled back - that is the stage's current state.
        { actionType: 'campaign_activation', status: 'rolled_back', proposedAt: '2026-08-03T00:00:00Z' },
      ],
      campaignStatus: 'paused',
      lastReadStateAt: '2026-08-04T00:00:00Z',
      spend: { days: 3, totalUsd: 12 },
    });
    const byStage = Object.fromEntries(nodes.map((node) => [node.stage, node]));
    expect(byStage.draft).toMatchObject({ status: 'ok', at: '2026-08-01T00:00:00Z' });
    expect(byStage.activation).toMatchObject({ status: 'error', stateKey: 'lifecycle.activation.stopped', at: '2026-08-03T00:00:00Z' });
    expect(byStage.live).toMatchObject({ status: 'warn', stateKey: 'lifecycle.live.paused' });
    expect(byStage.sync).toMatchObject({ status: 'ok', at: '2026-08-04T00:00:00Z' });
    expect(byStage.spend).toMatchObject({ status: 'ok', stateKey: 'lifecycle.spend.measured' });
  });

  it('treats an in-flight activation as pending and a queryable-but-empty spend as none', () => {
    const nodes = buildCampaignLifecycle({
      actions: [{ actionType: 'campaign_activation', status: 'awaiting_approval', proposedAt: '2026-08-02T00:00:00Z' }],
      campaignStatus: 'enabled',
      spend: { days: 0, totalUsd: 0 },
    });
    const byStage = Object.fromEntries(nodes.map((node) => [node.stage, node]));
    expect(byStage.activation.status).toBe('warn');
    expect(byStage.live).toMatchObject({ status: 'ok', stateKey: 'lifecycle.live.enabled' });
    expect(byStage.spend).toMatchObject({ status: 'idle', stateKey: 'lifecycle.spend.none' });
  });
});

describe('summariseSpendDays', () => {
  it('is null with no days', () => {
    expect(summariseSpendDays([])).toBeNull();
  });

  it('totals, averages over the returned days and finds the peak', () => {
    expect(
      summariseSpendDays([
        { date: '2026-08-01', spendUsd: 10 },
        { date: '2026-08-02', spendUsd: 0 },
        { date: '2026-08-03', spendUsd: 20 },
      ]),
    ).toEqual({ totalUsd: 30, avgDailyUsd: 10, peak: { date: '2026-08-03', spendUsd: 20 }, activeDays: 2 });
  });
});

describe('countActionsByStatus', () => {
  it('counts per status, most frequent first', () => {
    expect(countActionsByStatus([{ status: 'executed' }, { status: 'rolled_back' }, { status: 'executed' }])).toEqual([
      { status: 'executed', count: 2 },
      { status: 'rolled_back', count: 1 },
    ]);
  });
});

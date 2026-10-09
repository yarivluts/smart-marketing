import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { AutopilotMonitor } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/autopilot-monitor';
import type { AutopilotTelemetryResult } from '@growthos/shared';

describe('AutopilotMonitor Component', () => {
  const orgId = 'org-123';
  const projectId = 'proj-456';
  const projectName = 'ScaleMaster Pro';

  const mockTelemetry: AutopilotTelemetryResult = {
    hasData: true,
    autopilotActive: true,
    killSwitchTriggered: false,
    kpis: {
      roasVelocity: {
        currentRoas: 4.82,
        targetRoas: 4.2,
        roasDeltaPct: 18.4,
        status: 'optimal',
      },
      spendCap: {
        activeSpendUsd: 24800,
        dailyCapUsd: 5000,
        capUtilizationPct: 82.7,
        pacingStatus: 'stable',
      },
      conversionVelocity: {
        currentVpm: 142.6,
        targetVpm: 120.0,
        deltaVpm: 22.6,
        latencyMs: 14,
      },
      cadenceStability: {
        jitterErrorPct: 0.02,
        nominalStatus: 'Nominal',
        syncPct: 99.8,
      },
    },
    channels: [
      {
        channel: 'google_ads',
        channelLabel: 'Google Ads',
        dailySpendUsd: 10500,
        spendSharePct: 42.3,
        roas7d: 4.82,
        targetRoas: 4.2,
        cpaUsd: 26.5,
        targetCpa: 30.0,
        conversionsPerMin: 68.4,
        trend: 'up',
        status: 'scaling',
      },
      {
        channel: 'meta_ads',
        channelLabel: 'Meta Reels',
        dailySpendUsd: 8200,
        spendSharePct: 33.1,
        roas7d: 3.45,
        targetRoas: 3.5,
        cpaUsd: 31.2,
        targetCpa: 32.0,
        conversionsPerMin: 45.2,
        trend: 'flat',
        status: 'stable',
      },
      {
        channel: 'tiktok',
        channelLabel: 'TikTok Pro',
        dailySpendUsd: 4100,
        spendSharePct: 16.5,
        roas7d: 2.15,
        targetRoas: 3.0,
        cpaUsd: 38.4,
        targetCpa: 32.0,
        conversionsPerMin: 21.0,
        trend: 'down',
        status: 'throttled',
      },
    ],
    fatigueAlerts: [
      {
        id: 'alert_1',
        creativeId: 'cr_1',
        creativeName: 'Summer Promo UGC',
        channel: 'Meta Reels',
        frequency: 4.6,
        currentCtrPct: 1.12,
        baselineCtrPct: 2.15,
        decayPct: 47.9,
        fatigueLevel: 'fatigued',
        recommendedAction: 'auto_swap',
        timestamp: '14m ago',
      },
    ],
    pipelineStages: [
      {
        stageId: 'telemetry_ingest',
        stageNumber: 'Stage 01',
        title: 'Telemetry Ingest',
        description: 'Multi-source telemetry synchronization & validation.',
        durationMs: 124,
        status: 'complete',
      },
      {
        stageId: 'neural_analysis',
        stageNumber: 'Stage 02',
        title: 'Neural Analysis',
        description: 'Deep behavioral inference & audience segmentation.',
        durationMs: 412,
        status: 'complete',
      },
      {
        stageId: 'channel_rebalance',
        stageNumber: 'Stage 03',
        title: 'Channel Rebalancing',
        description: 'Algorithmic cross-platform budget optimization across channels.',
        durationMs: 890,
        status: 'complete',
      },
      {
        stageId: 'fatigue_mitigation',
        stageNumber: 'Stage 04',
        title: 'Fatigue Mitigation',
        description: 'Asset wear-out detection & automated creative rotation.',
        durationMs: 340,
        status: 'complete',
      },
      {
        stageId: 'live_deployment',
        stageNumber: 'Stage 05',
        title: 'Live Deployment',
        description: 'Final mutation sync with ad network endpoints.',
        durationMs: 512,
        status: 'complete',
      },
    ],
    recentActions: [
      {
        id: 'act_101',
        timestamp: '10m ago',
        actionType: 'budget_rebalance',
        channel: 'Google Ads',
        beforeBudgetUsd: 9800,
        afterBudgetUsd: 10500,
        deltaPct: 7.1,
        reason: 'High ROAS scaling capacity',
        impact: '+$700 daily allocation',
        status: 'executed',
        executedBy: 'autopilot_engine',
      },
    ],
    guardrails: {
      dailyCapUsd: 5000,
      minRoasFloor: 2.5,
      maxCpaCeiling: 35.0,
      maxShiftVelocityPct: 15.0,
      killSwitchEngaged: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      }),
    );
  });

  it('renders all Pastel Pulse sections matching Stitch design 09980af8', () => {
    renderWithIntl(
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    // Header & Banner
    expect(screen.getByText('Autopilot Pipeline Monitor')).toBeDefined();
    expect(screen.getByText('Autonomous Pipeline Operational')).toBeDefined();
    expect(screen.getByText('Neural Sync: 99.8%')).toBeDefined();
    expect(screen.getByRole('button', { name: /Run Optimization Cycle/i })).toBeDefined();

    // 4 KPI Cards
    expect(screen.getByText('ROAS Velocity')).toBeDefined();
    expect(screen.getAllByText('4.82x').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('+18.4%')).toBeDefined();

    expect(screen.getByText('AI Spend Cap')).toBeDefined();
    expect(screen.getByText('82.7% Cap')).toBeDefined();

    expect(screen.getByText('Conversion Velocity')).toBeDefined();
    expect(screen.getByText('142.6')).toBeDefined();

    expect(screen.getByText('Cadence Stability')).toBeDefined();

    // Execution Sequence Stages
    expect(screen.getByText('Execution Sequence Progression')).toBeDefined();
    expect(screen.getByText('Telemetry Ingest')).toBeDefined();
    expect(screen.getByText('Neural Analysis')).toBeDefined();
    expect(screen.getByText('Channel Rebalancing')).toBeDefined();
    expect(screen.getByText('Fatigue Mitigation')).toBeDefined();
    expect(screen.getByText('Live Deployment')).toBeDefined();

    // Channel Spend Pacing
    expect(screen.getByText('Channel Spend Allocation')).toBeDefined();
    expect(screen.getAllByText('Google Ads').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Meta Reels').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TikTok Pro').length).toBeGreaterThanOrEqual(1);

    // Spend Guardrails
    expect(screen.getByText('Spend Allocation Guardrails')).toBeDefined();
    expect(screen.getByText('Daily Pacing Limit')).toBeDefined();
    expect(screen.getByText('$5,000 / day')).toBeDefined();
    expect(screen.getByText('Minimum ROAS Floor')).toBeDefined();
    expect(screen.getByText('Maximum CPA Ceiling')).toBeDefined();

    // Fatigue Alerts
    expect(screen.getByText('Creative Fatigue Radar & Auto-Rotation')).toBeDefined();
    expect(screen.getByText('Summer Promo UGC')).toBeDefined();
    expect(screen.getByText('-47.9%')).toBeDefined();

    // Action Ledger
    expect(screen.getByText('Autonomous Action Audit Ledger')).toBeDefined();
    expect(screen.getByText('+$700 daily allocation')).toBeDefined();
  });

  it('allows editing and saving spend guardrails', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          guardrails: {
            dailyCapUsd: 12000,
            minRoasFloor: 3.0,
            maxCpaCeiling: 30.0,
            maxShiftVelocityPct: 15.0,
          },
        }),
    });

    renderWithIntl(
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const adjustBtn = screen.getByRole('button', { name: /Adjust Guardrails/i });
    fireEvent.click(adjustBtn);

    const dailyCapInput = screen.getByDisplayValue('5000');
    fireEvent.change(dailyCapInput, { target: { value: '12000' } });

    const saveBtn = screen.getByRole('button', { name: /Save Guardrails/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('$12,000 / day')).toBeDefined();
    });
  });

  it('toggles emergency kill-switch and resumes operations', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, engaged: true }),
    });

    renderWithIntl(
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const killBtn = screen.getByRole('button', { name: /Emergency Kill-Switch/i });
    fireEvent.click(killBtn);

    await waitFor(() => {
      expect(screen.getByText('Autopilot Suspended (Emergency Safe Mode)')).toBeDefined();
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, engaged: false }),
    });

    const resumeBtn = screen.getByRole('button', { name: /Resume Autopilot/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(screen.getByText('Autonomous Pipeline Operational')).toBeDefined();
    });
  });

  it('triggers optimization cycle and updates telemetry', async () => {
    const updatedTelemetry: AutopilotTelemetryResult = {
      ...mockTelemetry,
      kpis: {
        ...mockTelemetry.kpis,
        roasVelocity: {
          ...mockTelemetry.kpis.roasVelocity,
          currentRoas: 5.15,
        },
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          result: {
            newTelemetry: updatedTelemetry,
          },
        }),
    });

    renderWithIntl(
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const optimizeBtn = screen.getByRole('button', { name: /Run Optimization Cycle/i });
    fireEvent.click(optimizeBtn);

    await waitFor(() => {
      expect(screen.getByText('5.15x')).toBeDefined();
    });
  });

  it('rolls back an action from the audit ledger', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          action: { id: 'act_101', status: 'rolled_back' },
        }),
    });

    renderWithIntl(
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const rollbackBtn = screen.getByRole('button', { name: /Rollback/i });
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(screen.getByText('Rolled back')).toBeDefined();
    });
  });
});

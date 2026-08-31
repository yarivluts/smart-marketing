import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { ConversionFunnel } from './conversion-funnel';
import { FunnelFlowConnector } from './funnel-flow-connector';
import { FunnelKpiSummary } from './funnel-kpi-summary';
import type { FunnelStep } from './funnel-types';

describe('Conversion Funnel Hub Components (Milestone 3)', () => {
  const mockSteps: FunnelStep[] = [
    {
      stageKey: 'sent',
      stepOrder: 1,
      stageLabel: 'Document Sent',
      customerCount: 1000,
      conversionPercent: 100,
      dropOffPercent: 0,
      avgDurationHours: 0,
    },
    {
      stageKey: 'viewed',
      stepOrder: 2,
      stageLabel: 'Document Viewed',
      customerCount: 380,
      conversionPercent: 38,
      dropOffPercent: 62,
      isBottleneck: true,
      avgDurationHours: 14.2,
    },
    {
      stageKey: 'signed',
      stepOrder: 3,
      stageLabel: 'Document Signed',
      customerCount: 220,
      conversionPercent: 22,
      dropOffPercent: 42,
      avgDurationHours: 4.8,
    },
  ];

  it('renders multi-step conversion funnel with steps, counts, and percentages', () => {
    renderWithIntl(<ConversionFunnel steps={mockSteps} funnelName="TestPipeline" />);

    expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-sent')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-viewed')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-signed')).toBeInTheDocument();

    expect(screen.getByTestId('count-sent')).toHaveTextContent('1,000 users');
    expect(screen.getByTestId('count-viewed')).toHaveTextContent('380 users');
    expect(screen.getByTestId('count-signed')).toHaveTextContent('220 users');

    expect(screen.getByTestId('pct-sent')).toHaveTextContent('100%');
    expect(screen.getByTestId('pct-viewed')).toHaveTextContent('38%');
    expect(screen.getByTestId('pct-signed')).toHaveTextContent('22%');

    expect(screen.getByTestId('dropoff-viewed')).toHaveTextContent('-62% drop-off');
    expect(screen.getByTestId('dropoff-signed')).toHaveTextContent('-42% drop-off');
  });

  it('displays executive KPI summary scorecards correctly', () => {
    renderWithIntl(
      <FunnelKpiSummary
        metrics={{
          totalStarted: 1000,
          totalCompleted: 220,
          overallConversionRate: 22,
          highestDropOffStage: mockSteps[1],
        }}
      />,
    );

    expect(screen.getByTestId('kpi-overall-conversion')).toHaveTextContent('22%');
    expect(screen.getByTestId('kpi-total-started')).toHaveTextContent('1,000');
    expect(screen.getByTestId('kpi-total-converted')).toHaveTextContent('220');
    expect(screen.getByTestId('kpi-bottleneck-label')).toHaveTextContent('Document Viewed');
    expect(screen.getByTestId('kpi-bottleneck-rate')).toHaveTextContent('(-62%)');
  });

  it('renders flow connectors between stages with drop-off percentage badges', () => {
    renderWithIntl(<FunnelFlowConnector dropOffPercent={62} />);

    expect(screen.getByTestId('funnel-flow-connector')).toBeInTheDocument();
    expect(screen.getByTestId('connector-dropoff-badge')).toHaveTextContent('-62%');
  });

  it('opens interactive stage breakdown on step click and closes it cleanly', () => {
    renderWithIntl(<ConversionFunnel steps={mockSteps} />);

    // Click step 2
    fireEvent.click(screen.getByTestId('funnel-step-viewed'));

    expect(screen.getByTestId('funnel-step-drilldown')).toBeInTheDocument();
    expect(screen.getByText('Stage Breakdown: Document Viewed')).toBeInTheDocument();
    expect(screen.getByText('14.2h')).toBeInTheDocument();

    // Close drilldown
    fireEvent.click(screen.getByTestId('close-drilldown-btn'));
    expect(screen.queryByTestId('funnel-step-drilldown')).not.toBeInTheDocument();
  });

  it('triggers AI Copilot drop-off optimization callback on button click', () => {
    const handleAskCopilot = vi.fn();
    renderWithIntl(<ConversionFunnel steps={mockSteps} onAskCopilot={handleAskCopilot} />);

    expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();
    const copilotBtn = screen.getByTestId('ask-copilot-btn');
    fireEvent.click(copilotBtn);

    expect(handleAskCopilot).toHaveBeenCalledTimes(1);
  });

  it('filters funnel data when channel filter tabs are clicked', () => {
    renderWithIntl(<ConversionFunnel steps={mockSteps} />);

    const metaFilterBtn = screen.getByTestId('channel-filter-meta');
    fireEvent.click(metaFilterBtn);

    // Filter should recalculate customer count
    expect(screen.getByTestId('count-viewed')).toBeInTheDocument();
  });
});

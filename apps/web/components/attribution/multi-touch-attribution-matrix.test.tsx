import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiTouchAttributionMatrix } from './multi-touch-attribution-matrix';
import { getBaselineAttributionTelemetry } from '@growthos/shared';

describe('MultiTouchAttributionMatrix Component (Stitch 2bc944e2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              action: 'rebalance',
              message: 'Channel spend rebalance executed according to Shapley & Markov marginal values.',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            telemetry: getBaselineAttributionTelemetry(90),
            activeConnectors: ['google_ads', 'stripe'],
          }),
      });
    });
  });

  it('renders all 4 elevated KPI scorecards matching Stitch design 2bc944e2', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    expect(screen.getByTestId('multi-touch-attribution-matrix')).toBeDefined();
    expect(screen.getByText('Multi-Touch Attribution Modeling Hub')).toBeDefined();

    // KPI 1: Total Attributed Revenue
    expect(screen.getByText('Total Attributed Revenue')).toBeDefined();
    expect(screen.getByText('$298,400')).toBeDefined();
    expect(screen.getByText(/1,140 verified conversions/i)).toBeDefined();
    expect(screen.getByText('+22.8% vs Last-Touch')).toBeDefined();

    // KPI 2: Top Converter Channel
    expect(screen.getByText('Top Converter Channel')).toBeDefined();
    expect(screen.getAllByText('Google').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High Intent')).toBeDefined();

    // KPI 3: Omni-Assisted Multiplier
    expect(screen.getByText('Omni-Assisted Multiplier')).toBeDefined();
    expect(screen.getByText('2.8x')).toBeDefined();
    expect(screen.getByText('touches / journey')).toBeDefined();

    // KPI 4: Incrementality Lift Index
    expect(screen.getByText('Incrementality Lift Index')).toBeDefined();
    expect(screen.getByText('+24.2%')).toBeDefined();
    expect(screen.getByText(/98.5% Stat Sig/i)).toBeDefined();
  });

  it('renders Model Variance bar chart with channels and variance percentages', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    expect(screen.getByText('Model Variance: Data-Driven ML vs. Last-Touch')).toBeDefined();
    expect(screen.getAllByText(/Google Search/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Meta Advantage\+/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/TikTok UGC/i).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Attribution Discovery:/i)).toBeDefined();
  });

  it('renders Top Customer Conversion Pathways table and supports category filtering', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    expect(screen.getByText('Top Customer Conversion Paths')).toBeDefined();
    expect(screen.getByText('All Paths')).toBeDefined();
    expect(screen.getByText('3+ Touchpoints')).toBeDefined();
    expect(screen.getByText('Paid-to-Organic')).toBeDefined();
    expect(screen.getByText('Enterprise B2B')).toBeDefined();

    // Filter by Enterprise B2B
    const b2bBtn = screen.getByRole('button', { name: 'Enterprise B2B' });
    fireEvent.click(b2bBtn);

    // Filter by All Paths
    const allBtn = screen.getByRole('button', { name: 'All Paths' });
    fireEvent.click(allBtn);
  });

  it('supports model switching across carousel models', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    const firstTouchBtn = screen.getByRole('button', { name: 'First-Touch' });
    fireEvent.click(firstTouchBtn);
    expect(firstTouchBtn.className).toContain('bg-pp-primary');

    const lastTouchBtn = screen.getByRole('button', { name: 'Last-Touch' });
    fireEvent.click(lastTouchBtn);
    expect(lastTouchBtn.className).toContain('bg-pp-primary');

    const linearBtn = screen.getByRole('button', { name: 'Linear' });
    fireEvent.click(linearBtn);
    expect(linearBtn.className).toContain('bg-pp-primary');

    const dataDrivenBtn = screen.getByRole('button', { name: /Data-Driven ML/i });
    fireEvent.click(dataDrivenBtn);
    expect(dataDrivenBtn.className).toContain('bg-pp-primary');
  });

  it('allows toggling lookback days and fetches updated telemetry', async () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} orgId="org-1" projectId="proj-1" />);

    const btn90 = screen.getByRole('button', { name: '90 Days' });
    fireEvent.click(btn90);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/projects/proj-1/attribution?lookback=90'),
      );
    });
  });

  it('renders Autonomous Copilot and triggers Execute Rebalance and Simulate Impact', async () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} orgId="org-1" projectId="proj-1" />);

    expect(screen.getByText('Autonomous Copilot')).toBeDefined();
    expect(screen.getByText(/Rec #512 • 98.4% Confidence/i)).toBeDefined();
    expect(screen.getByText(/\+\$14,200 MRR/i)).toBeDefined();

    const rebalanceBtn = screen.getByRole('button', { name: /Execute Rebalance/i });
    fireEvent.click(rebalanceBtn);

    await waitFor(() => {
      expect(screen.getByText(/Channel spend rebalance executed/i)).toBeDefined();
    });

    const simulateBtn = screen.getByRole('button', { name: /Simulate Impact/i });
    fireEvent.click(simulateBtn);
  });

  it('renders Model Sensitivity slider and Ingestion Health Stream', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    expect(screen.getByText('Model Sensitivity & Ingestion')).toBeDefined();
    expect(screen.getByText('Half-life Decay Window')).toBeDefined();
    expect(screen.getByText('Weight Allocation Vector')).toBeDefined();
    expect(screen.getByText('Server-Side CAPI + Snowplow')).toBeDefined();
    expect(screen.getByText(/0s stream lag • 99.8% match confidence/i)).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});

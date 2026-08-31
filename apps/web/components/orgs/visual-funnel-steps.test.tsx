import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VisualFunnelSteps } from './visual-funnel-steps';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';

describe('VisualFunnelSteps Component', () => {
  it('renders default EasySign conversion funnel with accurate step counts and testids', () => {
    renderWithIntl(<VisualFunnelSteps />);

    expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-sent')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-viewed')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-signed')).toBeInTheDocument();

    expect(screen.getByTestId('count-sent')).toHaveTextContent('1000 users');
    expect(screen.getByTestId('count-viewed')).toHaveTextContent('380 users');
    expect(screen.getByTestId('count-signed')).toHaveTextContent('220 users');
  });

  it('renders precise conversion percentages, drop-off indicators, and progress bar widths', () => {
    renderWithIntl(<VisualFunnelSteps />);

    expect(screen.getByTestId('pct-sent')).toHaveTextContent('100%');
    expect(screen.getByTestId('pct-viewed')).toHaveTextContent('38%');
    expect(screen.getByTestId('pct-signed')).toHaveTextContent('22%');

    expect(screen.getByTestId('dropoff-viewed')).toHaveTextContent('-62% drop-off');
    expect(screen.getByTestId('dropoff-signed')).toHaveTextContent('-42% drop-off');

    expect(screen.getByTestId('bar-sent')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('bar-viewed')).toHaveStyle({ width: '38%' });
    expect(screen.getByTestId('bar-signed')).toHaveStyle({ width: '22%' });
  });

  it('displays proactive drop-off alert card and invokes onAskCopilot callback on click', () => {
    const handleAskCopilot = vi.fn();
    renderWithIntl(<VisualFunnelSteps onAskCopilot={handleAskCopilot} />);

    expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();

    const askBtn = screen.getByTestId('ask-copilot-btn');
    expect(askBtn).toBeInTheDocument();
    fireEvent.click(askBtn);
    expect(handleAskCopilot).toHaveBeenCalledTimes(1);
  });

  it('renders simulated mode badge when isSimulated is true', () => {
    renderWithIntl(<VisualFunnelSteps isSimulated={true} />);
    expect(screen.getByText('Simulated Mode (Zero-Config)')).toBeInTheDocument();
  });

  it('supports custom step items accurately', () => {
    const customSteps = [
      {
        stageKey: 'landing',
        stageLabel: 'Landing Page',
        stepOrder: 1,
        customerCount: 5000,
        conversionPercent: 100,
        dropOffPercent: 0,
      },
      {
        stageKey: 'checkout',
        stageLabel: 'Checkout',
        stepOrder: 2,
        customerCount: 1500,
        conversionPercent: 30,
        dropOffPercent: 70,
      },
    ];

    renderWithIntl(<VisualFunnelSteps steps={customSteps} funnelName="Checkout Funnel" />);

    expect(screen.getByTestId('funnel-step-landing')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-checkout')).toBeInTheDocument();
    expect(screen.getByTestId('count-landing')).toHaveTextContent('5000 users');
    expect(screen.getByTestId('count-checkout')).toHaveTextContent('1500 users');
    expect(screen.getByTestId('dropoff-checkout')).toHaveTextContent('-70% drop-off');
  });
});

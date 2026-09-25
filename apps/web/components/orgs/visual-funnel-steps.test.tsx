import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VisualFunnelSteps } from './visual-funnel-steps';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import type { FunnelStepItem } from '../../lib/orgs/funnel-goals-synthesizer';

const STEPS: FunnelStepItem[] = [
  { stageKey: 'sent', stageLabel: 'Sent', stepOrder: 1, customerCount: 500, conversionPercent: 100, dropOffPercent: 0 },
  { stageKey: 'viewed', stageLabel: 'Viewed', stepOrder: 2, customerCount: 200, conversionPercent: 40, dropOffPercent: 60 },
  { stageKey: 'signed', stageLabel: 'Signed', stepOrder: 3, customerCount: 150, conversionPercent: 30, dropOffPercent: 25 },
];

describe('VisualFunnelSteps Component', () => {
  /*
    Called with no steps, this component used to render `createMockEasySignFunnel()` -
    1000 / 380 / 220 users, a 62% drop-off alert and an "Ask AI Copilot" button - so any caller
    without a funnel still put invented numbers on screen. Those tests asserted the sample
    (1000 users, 38%, -62% drop-off); they are replaced by this one.
  */
  it('renders nothing - no sample funnel, no alert - when given no steps', () => {
    const { container } = renderWithIntl(<VisualFunnelSteps steps={[]} funnelName="EasySign" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('funnel-dropoff-alert-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ask-copilot-btn')).not.toBeInTheDocument();
  });

  it('never renders a "Simulated Mode" badge', () => {
    renderWithIntl(<VisualFunnelSteps steps={STEPS} funnelName="EasySign" />);
    expect(screen.queryByText(/Simulated/)).not.toBeInTheDocument();
  });

  it('renders measured counts, conversion percentages, drop-offs and bar widths', () => {
    renderWithIntl(<VisualFunnelSteps steps={STEPS} funnelName="EasySign" />);

    expect(screen.getByText('Conversion Funnel: EasySign')).toBeInTheDocument();
    expect(screen.getByTestId('count-sent')).toHaveTextContent('500 users');
    expect(screen.getByTestId('count-viewed')).toHaveTextContent('200 users');
    expect(screen.getByTestId('count-signed')).toHaveTextContent('150 users');

    expect(screen.getByTestId('pct-viewed')).toHaveTextContent('40%');
    expect(screen.getByTestId('dropoff-viewed')).toHaveTextContent('-60% drop-off');
    expect(screen.getByTestId('bar-sent')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('bar-signed')).toHaveStyle({ width: '30%' });
  });

  it('shows the drop-off alert for a measured high drop-off and invokes onAskCopilot', () => {
    const handleAskCopilot = vi.fn();
    renderWithIntl(<VisualFunnelSteps steps={STEPS} funnelName="EasySign" onAskCopilot={handleAskCopilot} />);

    expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ask-copilot-btn'));
    expect(handleAskCopilot).toHaveBeenCalledTimes(1);
  });

  it('shows the alert without an action button when there is nothing to apply', () => {
    renderWithIntl(<VisualFunnelSteps steps={STEPS} funnelName="EasySign" />);
    expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();
    expect(screen.queryByTestId('ask-copilot-btn')).not.toBeInTheDocument();
  });
});

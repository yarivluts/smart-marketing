import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VisualFunnelSteps } from './visual-funnel-steps';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { calculateFunnelStepItems, type FunnelStepItem } from '../../lib/orgs/funnel-goals-synthesizer';

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
    expect(screen.getByTestId('count-sent')).toHaveTextContent('500 people');
    expect(screen.getByTestId('count-viewed')).toHaveTextContent('200 people');
    expect(screen.getByTestId('count-signed')).toHaveTextContent('150 people');

    expect(screen.getByTestId('pct-viewed')).toHaveTextContent('40%');
    expect(screen.getByTestId('dropoff-viewed')).toHaveTextContent('-60% drop-off');
    expect(screen.getByTestId('bar-sent')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('bar-signed')).toHaveStyle({ width: '30%' });
  });

  /*
    B20: EasySign's page showed "Total Started 4", every later step "6 users", "Overall Conversion 150%" and
    "-0% drop-off". With the sequential people counts the query now returns, it reads 4 -> 2 -> 2 -> 2 -> 2.
  */
  it("renders EasySign's funnel in people: 50% overall, one real drop-off, no signed zero", () => {
    const easySign = calculateFunnelStepItems([
      { eventSchemaName: 'touchpoint', stageKey: 'awareness', stepOrder: 0, customerCount: 4, conversionRateFromFirst: 1 },
      { eventSchemaName: 'signup', stageKey: 'signup', stepOrder: 1, customerCount: 2, conversionRateFromFirst: 0.5 },
      { eventSchemaName: 'document_signed', stageKey: 'other', stepOrder: 2, customerCount: 2, conversionRateFromFirst: 0.5 },
    ]);
    renderWithIntl(<VisualFunnelSteps steps={easySign} funnelName="EasySign" />);

    expect(screen.getByTestId('count-awareness')).toHaveTextContent('4 people');
    expect(screen.getByTestId('count-signup')).toHaveTextContent('2 people');
    expect(screen.getByText('Overall Conversion:').parentElement).toHaveTextContent('50%');
    expect(screen.getByTestId('dropoff-signup')).toHaveTextContent('-50% drop-off');
    expect(screen.getByTestId('dropoff-other')).toHaveTextContent('0% drop-off');
    expect(screen.getByTestId('dropoff-other')).not.toHaveTextContent('-0%');
    // Nothing above 100% anywhere on the card.
    expect(screen.queryAllByText(/(^|\D)(10[1-9]|1[1-9]\d|[2-9]\d\d|\d{4,})%/)).toHaveLength(0);
  });

  it('says "1 person", not "1 people"', () => {
    renderWithIntl(
      <VisualFunnelSteps
        steps={[{ stageKey: 'solo', stageLabel: 'Solo', stepOrder: 0, customerCount: 1, conversionPercent: 100, dropOffPercent: 0 }]}
        funnelName="EasySign"
      />,
    );
    expect(screen.getByTestId('count-solo')).toHaveTextContent('1 person');
  });

  it('never renders an overall conversion above 100%, even if handed counts that grow', () => {
    renderWithIntl(
      <VisualFunnelSteps
        steps={calculateFunnelStepItems([
          { stageKey: 'a', stepOrder: 0, customerCount: 4 },
          { stageKey: 'b', stepOrder: 1, customerCount: 6 },
        ])}
        funnelName="EasySign"
      />,
    );
    expect(screen.getByText('Overall Conversion:').parentElement).toHaveTextContent('100%');
    expect(screen.queryByText('150%')).not.toBeInTheDocument();
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
  /*
    KAN-199: a funnel set over MCP can have several steps in the same stage (EasySign's
    document_created / document_sent / document_signed all classify as "other"). Each is its own
    row, told apart by its event schema name, and the drop-off highlight lands on one step only.
  */
  it('renders every step of a funnel whose steps share a stage key, labelled by event name', () => {
    const shared: FunnelStepItem[] = [
      { eventSchemaName: 'signup', stageKey: 'signup', stageLabel: 'Signup', stepOrder: 0, customerCount: 100, conversionPercent: 100, dropOffPercent: 0 },
      { eventSchemaName: 'document_sent', stageKey: 'other', stageLabel: 'Other', stepOrder: 1, customerCount: 50, conversionPercent: 50, dropOffPercent: 50 },
      { eventSchemaName: 'document_signed', stageKey: 'other', stageLabel: 'Other', stepOrder: 2, customerCount: 40, conversionPercent: 40, dropOffPercent: 20 },
    ];
    renderWithIntl(<VisualFunnelSteps steps={shared} funnelName="EasySign" />);

    expect(screen.getByTestId('event-0')).toHaveTextContent('signup');
    expect(screen.getByTestId('event-1')).toHaveTextContent('document_sent');
    expect(screen.getByTestId('event-2')).toHaveTextContent('document_signed');
    expect(screen.getAllByTestId('funnel-step-other')).toHaveLength(2);
    expect(screen.getAllByTestId('funnel-step-other').filter((row) => row.className.includes('border-amber-300'))).toHaveLength(1);
  });
});

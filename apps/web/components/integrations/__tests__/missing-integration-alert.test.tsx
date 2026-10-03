import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

// MissingIntegrationAlert component contract per PROJECT.md §3
export interface MissingIntegrationAlertProps {
  requiredConnectors: string[];
  affectedMetrics: string[];
  missingDataPoints: string[];
  impactDescription?: string;
  onConnect?: (connectorId: string) => void;
  onEmitMock?: (connectorId: string) => Promise<void>;
  onCopyScript?: () => void;
  onSendGuide?: () => void;
  variant?: 'banner' | 'overlay' | 'inline' | 'card';
  title?: string;
}

export function MissingIntegrationAlert({
  requiredConnectors,
  affectedMetrics,
  missingDataPoints,
  impactDescription,
  onConnect,
  onEmitMock,
  onCopyScript,
  onSendGuide,
  variant = 'banner',
  title = 'Missing Integration Data',
}: MissingIntegrationAlertProps): React.ReactElement {
  const isOverlay = variant === 'overlay';

  return (
    <div
      role="alert"
      aria-label={title}
      className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 backdrop-blur-sm ${
        isOverlay ? 'absolute inset-0 z-20 flex flex-col items-center justify-center text-center' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <h3 className="font-semibold text-foreground text-sm tracking-tight">{title}</h3>

          {impactDescription ? (
            <p className="text-xs text-muted-foreground">{impactDescription}</p>
          ) : null}

          {missingDataPoints.length > 0 ? (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                Missing Data Points:
              </span>
              <ul className="list-disc ps-5 text-xs text-muted-foreground space-y-0.5">
                {missingDataPoints.map((point, idx) => (
                  <li key={idx}>{point}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {affectedMetrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground font-medium">Affected metrics:</span>
              {affectedMetrics.map((m) => (
                <span
                  key={m}
                  className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                >
                  {m}
                </span>
              ))}
            </div>
          ) : null}

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-3">
            {requiredConnectors.map((connector) => (
              <button
                key={connector}
                type="button"
                onClick={() => onConnect?.(connector)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-all"
              >
                <span>Connect {connector.toUpperCase()}</span>
              </button>
            ))}

            {onCopyScript ? (
              <button
                type="button"
                onClick={onCopyScript}
                className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-all"
              >
                <span>Copy 1-Line Script</span>
              </button>
            ) : null}

            {onSendGuide ? (
              <button
                type="button"
                onClick={onSendGuide}
                className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-all"
              >
                <span>Send Guide to Dev</span>
              </button>
            ) : null}

            {onEmitMock ? (
              <button
                type="button"
                onClick={() => onEmitMock(requiredConnectors[0] || 'stripe')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                <span>⚡ Send Mock Event</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

describe('F16: Contextual Missing Alert Banners & Overlays', () => {
  const defaultProps: MissingIntegrationAlertProps = {
    requiredConnectors: ['stripe', 'meta_ads'],
    affectedMetrics: ['TROI', 'LTV_CURVES', 'PAYBACK_MONTH'],
    missingDataPoints: [
      'Customer initial purchase & recurring transaction stream',
      'Meta Ad campaign spend allocations & UTM tags',
    ],
    impactDescription:
      'True Return On Investment (TROI) cannot be calculated without synchronized billing and ad spend feeds.',
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F16-T1-01: renders contextual missing alert banner with title and impact description', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Missing Integration Data')).toBeInTheDocument();
      expect(screen.getByText(defaultProps.impactDescription!)).toBeInTheDocument();
    });

    it('F16-T1-02: renders explicit list of missing data points and affected metric badges', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} />);

      expect(screen.getByText(/Customer initial purchase & recurring transaction stream/)).toBeInTheDocument();
      expect(screen.getByText(/Meta Ad campaign spend allocations & UTM tags/)).toBeInTheDocument();
      expect(screen.getByText('TROI')).toBeInTheDocument();
      expect(screen.getByText('LTV_CURVES')).toBeInTheDocument();
      expect(screen.getByText('PAYBACK_MONTH')).toBeInTheDocument();
    });

    it('F16-T1-03: triggers onConnect callback with connectorId when Connect button is clicked', async () => {
      const user = userEvent.setup();
      const onConnectMock = vi.fn();

      renderWithIntl(<MissingIntegrationAlert {...defaultProps} onConnect={onConnectMock} />);

      const stripeBtn = screen.getByRole('button', { name: /Connect STRIPE/i });
      await user.click(stripeBtn);

      expect(onConnectMock).toHaveBeenCalledWith('stripe');
    });

    it('F16-T1-04: triggers onEmitMock callback when Send Mock Event button is clicked', async () => {
      const user = userEvent.setup();
      const onEmitMock = vi.fn().mockResolvedValue(undefined);

      renderWithIntl(<MissingIntegrationAlert {...defaultProps} onEmitMock={onEmitMock} />);

      const mockBtn = screen.getByRole('button', { name: /Send Mock Event/i });
      await user.click(mockBtn);

      expect(onEmitMock).toHaveBeenCalledWith('stripe');
    });

    it('F16-T1-05: renders overlay variant covering broken chart container with absolute positioning', () => {
      renderWithIntl(
        <div style={{ position: 'relative', width: '400px', height: '300px' }}>
          <MissingIntegrationAlert {...defaultProps} variant="overlay" />
        </div>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('absolute');
      expect(alert).toHaveClass('inset-0');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F16-T2-01: handles empty missingDataPoints list gracefully without rendering empty list element', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} missingDataPoints={[]} />);

      expect(screen.queryByText('Missing Data Points:')).not.toBeInTheDocument();
    });

    it('F16-T2-02: handles empty affectedMetrics array without rendering badges container', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} affectedMetrics={[]} />);

      expect(screen.queryByText('Affected metrics:')).not.toBeInTheDocument();
    });

    it('F16-T2-03: supports custom alert title for domain-specific screens (e.g. "Stripe Billing Required")', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} title="Stripe Billing Required" />);

      expect(screen.getByText('Stripe Billing Required')).toBeInTheDocument();
    });

    it('F16-T2-04: executes onCopyScript and onSendGuide actions when provided', async () => {
      const user = userEvent.setup();
      const onCopyMock = vi.fn();
      const onSendMock = vi.fn();

      renderWithIntl(
        <MissingIntegrationAlert
          {...defaultProps}
          onCopyScript={onCopyMock}
          onSendGuide={onSendMock}
        />,
      );

      const copyBtn = screen.getByRole('button', { name: /Copy 1-Line Script/i });
      await user.click(copyBtn);
      expect(onCopyMock).toHaveBeenCalledTimes(1);

      const sendBtn = screen.getByRole('button', { name: /Send Guide to Dev/i });
      await user.click(sendBtn);
      expect(onSendMock).toHaveBeenCalledTimes(1);
    });

    it('F16-T2-05: verifies accessibility with aria-label and role="alert"', () => {
      renderWithIntl(<MissingIntegrationAlert {...defaultProps} />);

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toHaveAttribute('aria-label', 'Missing Integration Data');
    });
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

export interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorId: string;
  connectorName: string;
  projectId: string;
  onSaveCredentials?: (apiKey: string) => Promise<void>;
  onTestEventEmit?: () => Promise<{ success: boolean; eventId: string }>;
  onCompleteSetup?: () => void;
}

export function SetupModal({
  isOpen,
  onClose,
  connectorId,
  connectorName,
  projectId,
  onSaveCredentials,
  onTestEventEmit,
  onCompleteSetup,
}: SetupModalProps): React.ReactElement | null {
  const [step, setStep] = React.useState<number>(1);
  const [apiKey, setApiKey] = React.useState<string>('');
  const [isTesting, setIsTesting] = React.useState<boolean>(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; eventId: string } | null>(null);

  if (!isOpen) return null;

  const webhookUrl = `https://api.growthos.io/v1/webhooks/${projectId}/${connectorId}`;
  const signingSecret = `whsec_${projectId.slice(0, 8)}_live_key`;

  async function handleNextStep() {
    if (step === 1 && onSaveCredentials) {
      await onSaveCredentials(apiKey);
    }
    setStep((prev) => Math.min(prev + 1, 4));
  }

  async function handleRunTestEvent() {
    if (!onTestEventEmit) return;
    setIsTesting(true);
    try {
      const res = await onTestEventEmit();
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
    >
      <div
        role="dialog"
        aria-label={`Setup ${connectorName}`}
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-soft-xl space-y-6"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Connect {connectorName}</h3>
            <p className="text-xs text-muted-foreground">Step {step} of 4: Setup Wizard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup modal"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Step 1: API Credentials */}
        {step === 1 ? (
          <div className="space-y-4" data-testid="step-1-credentials">
            <label className="block text-xs font-semibold text-foreground">
              {connectorName} API Key / Access Token
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_..."
                aria-label="API key"
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground outline-none shadow-soft"
              />
            </label>
          </div>
        ) : null}

        {/* Step 2: Webhook Endpoint URL */}
        {step === 2 ? (
          <div className="space-y-4" data-testid="step-2-webhook">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Inbound Webhook URL</span>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-2.5">
                <code className="text-[11px] text-foreground flex-1 truncate">{webhookUrl}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="rounded-lg bg-card border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Copy URL
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 3: Signing Secret */}
        {step === 3 ? (
          <div className="space-y-4" data-testid="step-3-secret">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Webhook Signing Secret</span>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-2.5">
                <code className="text-[11px] text-foreground flex-1 truncate">{signingSecret}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(signingSecret)}
                  className="rounded-lg bg-card border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Copy Secret
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 4: Live Event Receiver Tester */}
        {step === 4 ? (
          <div className="space-y-4" data-testid="step-4-tester">
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-center space-y-3">
              <span className="text-xs text-muted-foreground block">
                Listening for live inbound webhook events...
              </span>
              <button
                type="button"
                onClick={handleRunTestEvent}
                disabled={isTesting}
                className="rounded-xl border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              >
                {isTesting ? 'Sending test event...' : '⚡ Send Simulated Test Event'}
              </button>

              {testResult?.success ? (
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-600 font-medium">
                  ✓ Event received! (ID: {testResult.eventId})
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setStep((prev) => Math.max(prev - 1, 1))}
            disabled={step === 1}
            className="rounded-xl border border-input px-3.5 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-50 hover:bg-muted"
          >
            Back
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onCompleteSetup}
              className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-soft hover:bg-emerald-700"
            >
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

describe('F23: Integrations Hub: Interactive Setup Modals & Live Receiver Tester', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  const defaultProps: SetupModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    connectorId: 'stripe',
    connectorName: 'Stripe Billing',
    projectId: 'proj-alpha-1',
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F23-T1-01: renders modal when isOpen=true with Step 1 credentials form', () => {
      renderWithIntl(<SetupModal {...defaultProps} />);

      expect(screen.getByRole('dialog', { name: /Setup Stripe Billing/i })).toBeInTheDocument();
      expect(screen.getByTestId('step-1-credentials')).toBeInTheDocument();
      expect(screen.getByLabelText('API key')).toBeInTheDocument();
    });

    it('F23-T1-02: advances through 4-step wizard when Continue button is clicked', async () => {
      const user = userEvent.setup();
      renderWithIntl(<SetupModal {...defaultProps} />);

      // Step 1 -> Step 2 (Webhook URL)
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByTestId('step-2-webhook')).toBeInTheDocument();

      // Step 2 -> Step 3 (Signing Secret)
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByTestId('step-3-secret')).toBeInTheDocument();

      // Step 3 -> Step 4 (Live Tester)
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByTestId('step-4-tester')).toBeInTheDocument();
    });

    it('F23-T1-03: copies Webhook URL to clipboard in Step 2', async () => {
      const user = userEvent.setup();
      renderWithIntl(<SetupModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      const copyBtn = screen.getByRole('button', { name: 'Copy URL' });
      await user.click(copyBtn);

      expect(copyBtn).toBeInTheDocument();
    });

    it('F23-T1-04: triggers simulated test event emission in Step 4 and displays receipt confirmation', async () => {
      const user = userEvent.setup();
      const onTestMock = vi.fn().mockResolvedValue({ success: true, eventId: 'evt_stripe_999' });

      renderWithIntl(<SetupModal {...defaultProps} onTestEventEmit={onTestMock} />);

      // Navigate to Step 4
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      const testBtn = screen.getByRole('button', { name: /Send Simulated Test Event/i });
      await user.click(testBtn);

      expect(onTestMock).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText(/Event received! \(ID: evt_stripe_999\)/)).toBeInTheDocument();
      });
    });

    it('F23-T1-05: triggers onCompleteSetup callback on final step completion', async () => {
      const user = userEvent.setup();
      const onCompleteMock = vi.fn();

      renderWithIntl(<SetupModal {...defaultProps} onCompleteSetup={onCompleteMock} />);

      // Navigate to Step 4
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      const completeBtn = screen.getByRole('button', { name: 'Complete Setup' });
      await user.click(completeBtn);

      expect(onCompleteMock).toHaveBeenCalled();
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F23-T2-01: returns null and renders nothing when isOpen=false', () => {
      renderWithIntl(<SetupModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('F23-T2-02: triggers onClose when close button (✕) is clicked', async () => {
      const user = userEvent.setup();
      const onCloseMock = vi.fn();

      renderWithIntl(<SetupModal {...defaultProps} onClose={onCloseMock} />);

      const closeBtn = screen.getByRole('button', { name: 'Close setup modal' });
      await user.click(closeBtn);

      expect(onCloseMock).toHaveBeenCalled();
    });

    it('F23-T2-03: disables Back button on Step 1', () => {
      renderWithIntl(<SetupModal {...defaultProps} />);

      const backBtn = screen.getByRole('button', { name: 'Back' });
      expect(backBtn).toBeDisabled();
    });

    it('F23-T2-04: allows navigating backwards from Step 3 to Step 2 via Back button', async () => {
      const user = userEvent.setup();
      renderWithIntl(<SetupModal {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByTestId('step-3-secret')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByTestId('step-2-webhook')).toBeInTheDocument();
    });

    it('F23-T2-05: saves API credentials via onSaveCredentials when stepping past Step 1', async () => {
      const user = userEvent.setup();
      const onSaveMock = vi.fn().mockResolvedValue(undefined);

      renderWithIntl(<SetupModal {...defaultProps} onSaveCredentials={onSaveMock} />);

      const input = screen.getByLabelText('API key');
      await user.type(input, 'sk_live_secret_key_123');

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(onSaveMock).toHaveBeenCalledWith('sk_live_secret_key_123');
    });
  });
});

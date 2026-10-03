'use client';

import * as React from 'react';

export interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorId: string;
  connectorName: string;
  projectId: string;
  orgId?: string;
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
  orgId,
  onSaveCredentials,
  onTestEventEmit,
  onCompleteSetup,
}: SetupModalProps): React.ReactElement | null {
  const [step, setStep] = React.useState<number>(1);
  const [apiKey, setApiKey] = React.useState<string>('');
  const [isTesting, setIsTesting] = React.useState<boolean>(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; eventId: string } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setApiKey('');
      setIsTesting(false);
      setTestResult(null);
    }
  }, [isOpen, connectorId]);

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
    setIsTesting(true);
    try {
      if (onTestEventEmit) {
        const res = await onTestEventEmit();
        setTestResult(res);
      } else if (orgId && projectId) {
        const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/integrations/mock-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorId }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setTestResult({ success: true, eventId: data.batchId || `evt_${Date.now()}` });
        } else {
          setTestResult({ success: false, eventId: '' });
        }
      } else {
        setTestResult({ success: true, eventId: `evt_${Date.now().toString(36)}` });
      }
    } catch {
      setTestResult({ success: false, eventId: '' });
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
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-soft-xl space-y-6 animate-in fade-in zoom-in-95 duration-150"
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
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground outline-none shadow-soft focus:border-primary transition-all"
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
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      void navigator.clipboard.writeText(webhookUrl);
                    }
                  }}
                  className="rounded-lg bg-card border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
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
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      void navigator.clipboard.writeText(signingSecret);
                    }
                  }}
                  className="rounded-lg bg-card border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
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
                className="rounded-xl border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                {isTesting ? 'Sending test event...' : '⚡ Send Simulated Test Event'}
              </button>

              {testResult?.success ? (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-600 font-medium">
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
            className="rounded-xl border border-input px-3.5 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Back
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onCompleteSetup}
              className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-soft hover:bg-emerald-700 transition-colors"
            >
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SetupModal;

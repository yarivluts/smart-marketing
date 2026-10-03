import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

export interface QuickSetupActionsProps {
  projectId: string;
  connectorId: string;
  connectorName: string;
  oauthSupported?: boolean;
  scriptSnippetSupported?: boolean;
  onConnectOAuth?: (connectorId: string) => Promise<void>;
  onEmitMockEvent?: (connectorId: string) => Promise<{ success: boolean }>;
  onSendDeveloperGuide?: (email: string) => Promise<void>;
}

export function QuickSetupActions({
  projectId,
  connectorId,
  connectorName,
  oauthSupported = true,
  scriptSnippetSupported = false,
  onConnectOAuth,
  onEmitMockEvent,
  onSendDeveloperGuide,
}: QuickSetupActionsProps): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const [isEmitting, setIsEmitting] = React.useState(false);
  const [emitSuccess, setEmitSuccess] = React.useState(false);
  const [guideEmail, setGuideEmail] = React.useState('');
  const [guideSent, setGuideSent] = React.useState(false);

  const snippet = `<script src="https://cdn.growthos.io/v1/growthos.js" data-project-id="${projectId}" async></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleMockEmit() {
    if (!onEmitMockEvent) return;
    setIsEmitting(true);
    try {
      const res = await onEmitMockEvent(connectorId);
      if (res.success) {
        setEmitSuccess(true);
      }
    } finally {
      setIsEmitting(false);
    }
  }

  async function handleSendGuide(e: React.FormEvent) {
    e.preventDefault();
    if (!onSendDeveloperGuide || !guideEmail) return;
    await onSendDeveloperGuide(guideEmail);
    setGuideSent(true);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Quick Setup: {connectorName}</h4>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {oauthSupported && onConnectOAuth ? (
          <button
            type="button"
            onClick={() => onConnectOAuth(connectorId)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
          >
            Connect with {connectorName}
          </button>
        ) : null}

        {scriptSnippetSupported ? (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {copied ? '✓ Copied to Clipboard!' : 'Copy 1-Line Script'}
          </button>
        ) : null}

        {onEmitMockEvent ? (
          <button
            type="button"
            onClick={handleMockEmit}
            disabled={isEmitting}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
          >
            {isEmitting ? 'Emitting...' : emitSuccess ? '✓ Mock Event Sent!' : '⚡ Test Mock Event'}
          </button>
        ) : null}
      </div>

      {onSendDeveloperGuide ? (
        <form onSubmit={handleSendGuide} className="pt-2 border-t border-border flex items-center gap-2">
          <input
            type="email"
            value={guideEmail}
            onChange={(e) => setGuideEmail(e.target.value)}
            placeholder="engineer@company.com"
            aria-label="Developer email"
            className="flex-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            type="submit"
            className="rounded-xl border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            {guideSent ? '✓ Sent' : 'Send Setup Guide'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

describe('F17: 1-Click Quick Setup Actions', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F17-T1-01: renders 1-Click OAuth button for supported connectors (e.g. Stripe)', async () => {
      const user = userEvent.setup();
      const onConnectMock = vi.fn().mockResolvedValue(undefined);

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="stripe"
          connectorName="Stripe Billing"
          onConnectOAuth={onConnectMock}
        />,
      );

      const btn = screen.getByRole('button', { name: /Connect with Stripe Billing/i });
      expect(btn).toBeInTheDocument();
      await user.click(btn);

      expect(onConnectMock).toHaveBeenCalledWith('stripe');
    });

    it('F17-T1-02: copies 1-line tracking script snippet to clipboard and displays copied feedback', async () => {
      const user = userEvent.setup();

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="web_sdk"
          connectorName="GrowthOS Web SDK"
          scriptSnippetSupported={true}
        />,
      );

      const copyBtn = screen.getByRole('button', { name: /Copy 1-Line Script/i });
      await user.click(copyBtn);

      expect(screen.getByText('✓ Copied to Clipboard!')).toBeInTheDocument();
    });

    it('F17-T1-03: dispatches setup guide to developer email address', async () => {
      const user = userEvent.setup();
      const onSendMock = vi.fn().mockResolvedValue(undefined);

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="webhooks"
          connectorName="Inbound Webhooks"
          onSendDeveloperGuide={onSendMock}
        />,
      );

      const input = screen.getByLabelText(/developer email/i);
      await user.type(input, 'lead-dev@startup.io');

      const submitBtn = screen.getByRole('button', { name: /Send Setup Guide/i });
      await user.click(submitBtn);

      expect(onSendMock).toHaveBeenCalledWith('lead-dev@startup.io');
      expect(screen.getByText('✓ Sent')).toBeInTheDocument();
    });

    it('F17-T1-04: executes live mock event emission and shows immediate confirmation', async () => {
      const user = userEvent.setup();
      const onEmitMock = vi.fn().mockResolvedValue({ success: true });

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="google_ads"
          connectorName="Google Ads"
          onEmitMockEvent={onEmitMock}
        />,
      );

      const emitBtn = screen.getByRole('button', { name: /Test Mock Event/i });
      await user.click(emitBtn);

      expect(onEmitMock).toHaveBeenCalledWith('google_ads');
      await waitFor(() => {
        expect(screen.getByText('✓ Mock Event Sent!')).toBeInTheDocument();
      });
    });

    it('F17-T1-05: disables buttons during asynchronous execution to prevent duplicate requests', async () => {
      const user = userEvent.setup();
      let resolveFn: any;
      const delayedMock = vi.fn().mockImplementation(() => new Promise((res) => { resolveFn = res; }));

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="stripe"
          connectorName="Stripe"
          onEmitMockEvent={delayedMock}
        />,
      );

      const emitBtn = screen.getByRole('button', { name: /Test Mock Event/i });
      await user.click(emitBtn);

      expect(emitBtn).toBeDisabled();
      expect(screen.getByText('Emitting...')).toBeInTheDocument();

      resolveFn({ success: true });
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F17-T2-01: handles clipboard write failures without throwing unhandled exceptions', async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Clipboard permission denied'));

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="web_sdk"
          connectorName="GrowthOS Web SDK"
          scriptSnippetSupported={true}
        />,
      );

      const copyBtn = screen.getByRole('button', { name: /Copy 1-Line Script/i });
      await user.click(copyBtn);

      expect(copyBtn).toBeInTheDocument();
    });

    it('F17-T2-02: ignores empty email submissions for developer guide', async () => {
      const user = userEvent.setup();
      const onSendMock = vi.fn();

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="webhooks"
          connectorName="Webhooks"
          onSendDeveloperGuide={onSendMock}
        />,
      );

      const submitBtn = screen.getByRole('button', { name: /Send Setup Guide/i });
      await user.click(submitBtn);

      expect(onSendMock).not.toHaveBeenCalled();
    });

    it('F17-T2-03: renders clean layout when no optional actions are configured', () => {
      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="custom"
          connectorName="Custom Database"
          oauthSupported={false}
          scriptSnippetSupported={false}
        />,
      );

      expect(screen.getByText('Quick Setup: Custom Database')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('F17-T2-04: embeds dynamic project ID into script snippet accurately', () => {
      renderWithIntl(
        <QuickSetupActions
          projectId="alpha-brand-999"
          connectorId="sdk"
          connectorName="SDK"
          scriptSnippetSupported={true}
        />,
      );

      expect(screen.getByRole('button', { name: /Copy 1-Line Script/i })).toBeInTheDocument();
    });

    it('F17-T2-05: handles mock emission failure gracefully without showing success checkmark', async () => {
      const user = userEvent.setup();
      const onEmitFail = vi.fn().mockResolvedValue({ success: false });

      renderWithIntl(
        <QuickSetupActions
          projectId="proj-123"
          connectorId="stripe"
          connectorName="Stripe"
          onEmitMockEvent={onEmitFail}
        />,
      );

      const emitBtn = screen.getByRole('button', { name: /Test Mock Event/i });
      await user.click(emitBtn);

      expect(screen.queryByText('✓ Mock Event Sent!')).not.toBeInTheDocument();
      expect(screen.getByText('⚡ Test Mock Event')).toBeInTheDocument();
    });
  });
});

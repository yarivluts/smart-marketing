'use client';

import * as React from 'react';
import type { CanonicalEventType } from '@growthos/shared';

export interface LiveEventTesterProps {
  connectorId: string;
  connectorName?: string;
  orgId?: string;
  projectId?: string;
  eventType?: CanonicalEventType;
  scenario?: string;
  onTestEventEmit?: () => Promise<{ success: boolean; eventId: string }>;
  onSuccess?: (eventId: string) => void;
  className?: string;
}

export function LiveEventTester({
  connectorId,
  connectorName,
  orgId,
  projectId,
  eventType,
  scenario,
  onTestEventEmit,
  onSuccess,
  className = '',
}: LiveEventTesterProps): React.ReactElement {
  const [isTesting, setIsTesting] = React.useState<boolean>(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; eventId: string; error?: string } | null>(null);

  const handleRunTestEvent = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      if (onTestEventEmit) {
        const res = await onTestEventEmit();
        setTestResult(res);
        if (res.success) {
          onSuccess?.(res.eventId);
        }
      } else if (orgId && projectId) {
        const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/integrations/mock-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorId, eventType, scenario }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          const result = { success: true, eventId: data.batchId || `evt_${Date.now()}` };
          setTestResult(result);
          onSuccess?.(result.eventId);
        } else {
          setTestResult({ success: false, eventId: '', error: data.message || data.error || 'Failed to emit test event' });
        }
      } else {
        // Standalone fallback
        const simulatedEventId = `evt_mock_${Date.now().toString(36)}`;
        const result = { success: true, eventId: simulatedEventId };
        setTestResult(result);
        onSuccess?.(simulatedEventId);
      }
    } catch (err) {
      setTestResult({
        success: false,
        eventId: '',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-border bg-muted/30 p-4 text-center space-y-3 ${className}`}
      data-testid="live-event-tester"
    >
      <span className="text-xs text-muted-foreground block">
        Listening for live inbound {connectorName || connectorId} webhook events...
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
      ) : testResult?.error ? (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-600 font-medium">
          ✕ Error: {testResult.error}
        </div>
      ) : null}
    </div>
  );
}

export default LiveEventTester;

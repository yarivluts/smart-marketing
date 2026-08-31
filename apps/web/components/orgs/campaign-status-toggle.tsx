'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

export interface CampaignStatusToggleProps {
  orgId: string;
  projectId: string;
  targetId: string;
  campaignLabel: string;
  initialStatus: 'enabled' | 'paused' | 'removed' | 'none' | null;
  disabled?: boolean;
  onStatusChange?: (newStatus: 'enabled' | 'paused') => void;
}

interface ToastState {
  visible: boolean;
  message: string;
  actionId?: string;
  previousStatus?: 'enabled' | 'paused';
}

export function CampaignStatusToggle({
  orgId,
  projectId,
  targetId,
  campaignLabel,
  initialStatus,
  disabled = false,
  onStatusChange,
}: CampaignStatusToggleProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [currentStatus, setCurrentStatus] = useState<'enabled' | 'paused'>(
    initialStatus === 'enabled' ? 'enabled' : 'paused',
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Sync state if initialStatus changes
  useEffect(() => {
    if (initialStatus === 'enabled' || initialStatus === 'paused') {
      setCurrentStatus(initialStatus);
    }
  }, [initialStatus]);

  // Ephemeral toast auto-dismiss after 6 seconds
  useEffect(() => {
    if (!toast?.visible) return;
    const timer = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, visible: false } : null));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleToggle(): Promise<void> {
    if (disabled || isSyncing) return;

    const previousStatus = currentStatus;
    const nextStatus: 'enabled' | 'paused' = currentStatus === 'enabled' ? 'paused' : 'enabled';
    const actionType = nextStatus === 'enabled' ? 'campaign_activation' : 'campaign_pause';

    // 1. Optimistic update
    setCurrentStatus(nextStatus);
    setIsSyncing(true);
    setErrorMessage(null);
    if (onStatusChange) {
      onStatusChange(nextStatus);
    }

    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetId, actionType }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        // Rollback state on error
        setCurrentStatus(previousStatus);
        if (onStatusChange) {
          onStatusChange(previousStatus);
        }

        if (response.status === 422 && data.violations?.length > 0) {
          setErrorMessage(t('guardrailBlockedError', { reason: data.violations[0].message || data.violations[0].type }));
        } else if (response.status === 403) {
          setErrorMessage(t('quickActionPermissionDenied'));
        } else {
          setErrorMessage(data.message || t('pauseError'));
        }
        return;
      }

      // Success: show 6s Undo toast
      setToast({
        visible: true,
        message: t('actionSuccessToast', { name: campaignLabel, status: nextStatus }),
        actionId: data.id,
        previousStatus,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setCurrentStatus(previousStatus);
      if (onStatusChange) {
        onStatusChange(previousStatus);
      }
      setErrorMessage(t('pauseError'));
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleUndo(): Promise<void> {
    if (!toast?.previousStatus || isSyncing) return;

    const targetStatusToRestore = toast.previousStatus;
    const actionId = toast.actionId;
    setToast(null);
    setIsSyncing(true);
    setCurrentStatus(targetStatusToRestore);

    try {
      if (actionId) {
        await fetch(
          `/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/rollback`,
          { method: 'POST' },
        );
      } else {
        await fetch(
          `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              targetId,
              actionType: targetStatusToRestore === 'enabled' ? 'campaign_activation' : 'campaign_pause',
            }),
          },
        );
      }

      if (onStatusChange) {
        onStatusChange(targetStatusToRestore);
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage(t('undoError'));
    } finally {
      setIsSyncing(false);
    }
  }

  const isEnabled = currentStatus === 'enabled';

  return (
    <div className="relative inline-flex flex-col gap-1" data-testid="campaign-status-toggle">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={t('statusToggleLabel', { name: campaignLabel })}
          disabled={disabled || isSyncing}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            isEnabled ? 'bg-green-600' : 'bg-muted-foreground/30 dark:bg-muted-foreground/40'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
              isEnabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
            }`}
          />
        </button>

        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${
            isEnabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          }`}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="text-[11px] font-normal text-muted-foreground">{t('statusSyncing')}</span>
            </>
          ) : isEnabled ? (
            t('statusActive')
          ) : (
            t('statusPaused')
          )}
        </span>
      </div>

      {/* Inline Error alert */}
      {errorMessage && (
        <div role="alert" className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Ephemeral 6s Undo Toast */}
      {toast?.visible && (
        <div
          data-testid="undo-toast"
          className="fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-xs text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" aria-hidden="true" />
          <span className="max-w-[280px] truncate">{toast.message}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 focus:outline-hidden"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>{t('undoButton')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

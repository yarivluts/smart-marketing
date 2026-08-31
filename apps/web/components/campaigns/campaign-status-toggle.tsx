'use client';

import * as React from 'react';
import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Switch } from '@/components/ui/switch';

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
          setErrorMessage(
            t('guardrailBlockedError', {
              reason: data.violations[0].message || data.violations[0].type,
            }),
          );
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
              actionType:
                targetStatusToRestore === 'enabled'
                  ? 'campaign_activation'
                  : 'campaign_pause',
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
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={disabled || isSyncing}
          aria-label={t('statusToggleLabel', { name: campaignLabel })}
          variant="emerald"
        />

        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${
            isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          }`}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="text-[11px] font-normal text-muted-foreground">
                {t('statusSyncing')}
              </span>
            </>
          ) : isEnabled ? (
            t('statusActive')
          ) : (
            t('statusPaused')
          )}
        </span>
      </div>

      {/* Inline Error alert */}
      {errorMessage ? (
        <div role="alert" className="flex items-center gap-1 text-[11px] text-destructive mt-0.5">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* Ephemeral 6s Undo Toast */}
      {toast?.visible ? (
        <div
          data-testid="undo-toast"
          className="fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-xs text-card-foreground shadow-xl animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
          <span className="max-w-[280px] truncate">{toast.message}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 focus:outline-hidden transition-colors"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>{t('undoButton')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

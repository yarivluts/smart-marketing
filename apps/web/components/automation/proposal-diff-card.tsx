'use client';

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  XCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Loader2,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DiffEntry {
  key: string;
  before: string | number;
  after: string | number;
  unit?: string;
}

export interface ActionProposalData {
  id?: string;
  targetId: string;
  targetLabel: string;
  actionType: 'budget_change' | 'bid_strategy_change' | 'status_toggle' | 'campaign_draft' | 'keyword_bid' | 'targeting_expansion' | string;
  platform?: 'meta_ads' | 'google_ads' | 'tiktok_ads' | 'linkedin_ads' | 'generic';
  impactBadge?: 'high' | 'medium' | 'low' | string;
  beforeValue?: string | number;
  afterValue?: string | number;
  diffEntries?: DiffEntry[];
  estimatedImpact?: string;
  guardrailWarning?: string | null;
  status?: 'awaiting_approval' | 'approved' | 'executed' | 'verified' | 'rolled_back' | 'rejected' | 'failed';
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface ProposalDiffCardProps {
  proposal: ActionProposalData;
  onApprove?: (proposal: ActionProposalData) => Promise<void> | void;
  onReject?: (proposal: ActionProposalData) => Promise<void> | void;
  onRollback?: (proposal: ActionProposalData) => Promise<void> | void;
  isLoading?: boolean;
  className?: string;
  showActions?: boolean;
  compact?: boolean;
}

export function ProposalDiffCard({
  proposal,
  onApprove,
  onReject,
  onRollback,
  isLoading = false,
  className,
  showActions = true,
  compact: _compact = false,
}: ProposalDiffCardProps): React.ReactElement {
  const t = useTranslations('Copilot');
  const locale = useLocale();
  const isRtl = locale === 'he';

  const [localStatus, setLocalStatus] = React.useState<ActionProposalData['status']>(
    proposal.status || 'awaiting_approval',
  );
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (proposal.status) {
      setLocalStatus(proposal.status);
    }
  }, [proposal.status]);

  async function handleApprove() {
    setActionLoading('approve');
    try {
      if (onApprove) {
        await onApprove(proposal);
      }
      setLocalStatus('executed');
    } catch {
      // Error handled by caller
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    setActionLoading('reject');
    try {
      if (onReject) {
        await onReject(proposal);
      }
      setLocalStatus('rejected');
    } catch {
      // Error handled by caller
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRollback() {
    setActionLoading('rollback');
    try {
      if (onRollback) {
        await onRollback(proposal);
      }
      setLocalStatus('rolled_back');
    } catch {
      // Error handled by caller
    } finally {
      setActionLoading(null);
    }
  }

  const impactColor =
    proposal.impactBadge === 'high'
      ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
      : proposal.impactBadge === 'medium'
        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  const diffItems: DiffEntry[] =
    proposal.diffEntries && proposal.diffEntries.length > 0
      ? proposal.diffEntries
      : proposal.beforeValue !== undefined && proposal.afterValue !== undefined
        ? [
            {
              key: proposal.actionType === 'budget_change' ? 'Daily Budget' : 'Value',
              before: proposal.beforeValue,
              after: proposal.afterValue,
            },
          ]
        : [];

  return (
    <div
      data-testid="proposal-card"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all duration-200 shadow-soft hover:shadow-hover hover:border-primary/30',
        localStatus === 'executed' && 'border-emerald-500/30 bg-emerald-500/[0.02]',
        localStatus === 'rolled_back' && 'border-amber-500/30 bg-amber-500/[0.02]',
        localStatus === 'rejected' && 'opacity-60 border-muted',
        className,
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {proposal.actionType.includes('budget') ? (
              <DollarSign className="h-4 w-4" />
            ) : proposal.actionType.includes('bid') ? (
              <Sliders className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate tracking-tight">
              {proposal.targetLabel}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span className="capitalize">{proposal.actionType.replace(/_/g, ' ')}</span>
              {proposal.platform && (
                <>
                  <span>•</span>
                  <span className="capitalize">{proposal.platform.replace(/_/g, ' ')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {proposal.impactBadge && (
            <span
              data-testid="impact-badge"
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                impactColor,
              )}
            >
              {proposal.impactBadge} impact
            </span>
          )}
        </div>
      </div>

      {/* Guardrail Warning Banner */}
      {proposal.guardrailWarning && (
        <div
          data-testid="guardrail-warning-banner"
          className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-300 font-medium"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{proposal.guardrailWarning}</span>
        </div>
      )}

      {/* Before / After Visual Comparison Grid */}
      {diffItems.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl bg-muted/40 p-3 text-xs border border-border/40">
          {diffItems.map((diff, index) => (
            <React.Fragment key={index}>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('beforeLabel') || 'Before'}:
                </span>
                <span
                  data-testid="before-diff"
                  className="mt-0.5 line-through font-semibold text-muted-foreground text-sm"
                  dir="ltr"
                >
                  {String(diff.before)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('afterLabel') || 'After'}:
                </span>
                <span
                  data-testid="after-diff"
                  className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400 text-sm"
                  dir="ltr"
                >
                  {String(diff.after)}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {/* Estimated Impact Note */}
      {proposal.estimatedImpact && (
        <div
          className="mt-2.5 flex items-center gap-2 text-xs font-medium text-muted-foreground"
          dir="auto"
        >
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{proposal.estimatedImpact}</span>
        </div>
      )}

      {/* Status Pill for Executed / Rolled Back / Rejected */}
      {localStatus && localStatus !== 'awaiting_approval' && localStatus !== 'approved' && (
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-xs">
          <span className="text-muted-foreground text-[11px]">Status:</span>
          <span
            data-testid="proposal-status-badge"
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              localStatus === 'executed' || localStatus === 'verified'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : localStatus === 'rolled_back'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {localStatus}
          </span>
        </div>
      )}

      {/* Actions Bar */}
      {showActions && (
        <div className="mt-3.5 flex items-center gap-2">
          {localStatus === 'awaiting_approval' || localStatus === 'approved' ? (
            <>
              <button
                type="button"
                data-testid="quick-execute-button"
                disabled={isLoading || actionLoading !== null}
                onClick={handleApprove}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2 px-3.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === 'approve' || isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {actionLoading === 'approve' || isLoading
                    ? t('executing') || 'Executing...'
                    : locale === 'he'
                      ? 'הפעל שינוי בלחיצה אחת'
                      : '1-Click Approve & Execute'}
                </span>
              </button>

              {onReject && (
                <button
                  type="button"
                  data-testid="reject-proposal-button"
                  disabled={isLoading || actionLoading !== null}
                  onClick={handleReject}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (localStatus === 'executed' || localStatus === 'verified') && onRollback ? (
            <button
              type="button"
              data-testid="proposal-rollback-button"
              disabled={isLoading || actionLoading !== null}
              onClick={handleRollback}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-2 px-3.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98] cursor-pointer"
            >
              {actionLoading === 'rollback' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              <span>{locale === 'he' ? 'בטל שינוי (Rollback)' : '1-Click Rollback'}</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

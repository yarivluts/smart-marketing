'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign,
  Layers,
  Filter,
  Zap,
  CheckCircle2,
  X,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { CopilotActionProposal, SmartRecommendationCardProps } from '@/lib/ai/copilot-types';

export type { SmartRecommendationCardProps, CopilotActionProposal };

const CATEGORY_CONFIG = {
  budget: {
    icon: DollarSign,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/10 border-emerald-500/20',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  ad_fatigue: {
    icon: Layers,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-500/10 border-amber-500/20',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  funnel_dropoff: {
    icon: Filter,
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    bgClass: 'bg-indigo-500/10 border-indigo-500/20',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
  pacing: {
    icon: Zap,
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    bgClass: 'bg-cyan-500/10 border-cyan-500/20',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  },
} as const;

const IMPACT_CONFIG = {
  high: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
} as const;

export function SmartRecommendationCard({
  id,
  category,
  title,
  description,
  beforeDiff,
  afterDiff,
  projectedImpact,
  actionProposal,
  onApprove,
  onDismiss,
}: SmartRecommendationCardProps): React.ReactElement {
  const t = useTranslations('Automation');
  const [isPending, setIsPending] = useState(false);
  const [isExecuted, setIsExecuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.budget;
  const CategoryIcon = config.icon;
  const impactClass = IMPACT_CONFIG[actionProposal.impactBadge] ?? IMPACT_CONFIG.medium;

  async function handleApprove(): Promise<void> {
    if (isPending || isExecuted) return;
    setIsPending(true);
    setError(null);

    try {
      await onApprove(actionProposal);
      setIsExecuted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('proposeError'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      data-testid="smart-card"
      data-card-id={id}
      className={`relative flex flex-col gap-3.5 rounded-xl border p-4 shadow-xs transition-all duration-200 ${
        isExecuted
          ? 'border-green-500/30 bg-green-500/5'
          : `${config.bgClass} hover:border-primary/40`
      }`}
    >
      {/* Top row: Category, Title, Impact Badge & Dismiss */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.badgeClass}`}
          >
            <CategoryIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`category_${category}` as 'category_budget' | 'category_ad_fatigue' | 'category_funnel_dropoff' | 'category_pacing')}
              </span>
              <span
                data-testid="impact-badge"
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${impactClass}`}
              >
                {t(`impact_${actionProposal.impactBadge}` as 'impact_high' | 'impact_medium' | 'impact_low')}
              </span>
            </div>
            <h4 className="text-sm font-bold text-foreground">{title}</h4>
          </div>
        </div>

        {onDismiss && !isExecuted && (
          <button
            type="button"
            data-testid="smart-card-dismiss"
            onClick={() => onDismiss(id)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label={t('dismiss')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-foreground/80 leading-relaxed" dir="auto">{description}</p>

      {/* Diff Pill Box */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/60 border border-border/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">{t('diffLabel')}{':'}</span>
          <span
            data-testid="before-diff"
            className="line-through text-muted-foreground"
            dir="ltr"
          >
            {beforeDiff}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          <span
            data-testid="after-diff"
            className="font-bold text-green-600 dark:text-green-400"
            dir="ltr"
          >
            {afterDiff}
          </span>
        </div>

        {/* Projected Impact */}
        <div className="flex items-center gap-1 text-[11px] font-medium text-purple-700 dark:text-purple-300">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{projectedImpact}</span>
        </div>
      </div>

      {/* Error Callout */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-1 flex items-center justify-between gap-3 pt-1 border-t border-border/40">
        <span className="text-[11px] text-muted-foreground truncate">
          {actionProposal.targetLabel}
        </span>

        {isExecuted ? (
          <span
            data-testid="rec-applied-badge"
            className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>{t('actionExecutedSuccess')}</span>
          </span>
        ) : (
          <button
            type="button"
            data-testid="smart-card-approve"
            disabled={isPending}
            onClick={handleApprove}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>{t('executing')}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('approveAndExecute')}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

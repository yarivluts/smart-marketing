'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMetricValue } from '@growthos/shared';
import {
  Clock,
  Sparkles,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import type { UnifiedGoalItem } from '@/lib/orgs/funnel-goals-synthesizer';
import { enteredGoalTargetText, storedGoalTarget, useGoalTargetEntryError } from './goal-target-entry';

export interface GoalThermometerCardProps {
  orgId: string;
  projectId: string;
  goal: UnifiedGoalItem;
  canExecute?: boolean;
  onTargetUpdated?: (goalId: string, nextTarget: { targetValue?: number; rangeMin?: number; rangeMax?: number }) => void;
  onOptimizeRequested?: (goal: UnifiedGoalItem) => void;
}

const STATUS_BADGE_STYLES: Record<NonNullable<UnifiedGoalItem['status']>, { badge: string; dot: string; bar: string }> = {
  on_track: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
  at_risk: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  off_track: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
  },
};

/**
 * A goal figure for display. A metric that declares its unit (KAN-213) is shown in it - a ratio 0.08
 * reads "8%". One that does not keeps the display it had before units existed, guessed from its name.
 */
function formatGoalValue(value: number, goal: Pick<UnifiedGoalItem, 'metricName' | 'unit'>, locale: string): string {
  return goal.unit ? formatMetricValue(value, goal.unit, locale) : formatValue(value, goal.metricName);
}

function formatValue(value: number, metricName: string): string {
  if (metricName.includes('usd') || metricName.includes('mrr') || metricName.includes('cac')) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (metricName.includes('pct') || metricName.includes('rate') || metricName.includes('cvr')) {
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
}

export function GoalThermometerCard({
  orgId,
  projectId,
  goal,
  canExecute = true,
  onTargetUpdated,
  onOptimizeRequested,
}: GoalThermometerCardProps): React.ReactElement {
  const t = useTranslations('Goals');
  const locale = useLocale();
  const targetEntryError = useGoalTargetEntryError();
  const show = (value: number) => formatGoalValue(value, goal, locale);

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  // A ratio goal's target is edited as a percent (KAN-213).
  const [targetInput, setTargetInput] = useState(enteredGoalTargetText(goal.targetValue, goal.unit));
  const [minInput, setMinInput] = useState(enteredGoalTargetText(goal.rangeMin, goal.unit));
  const [maxInput, setMaxInput] = useState(enteredGoalTargetText(goal.rangeMax, goal.unit));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
    Numbers render only for a goal whose progress was measured. Anything else - no rows in the
    goal's window yet, warehouse not configured, a failed query - shows the reason and the goal's
    own target, never a 0 actual with a pace judged against it.
  */
  // A paused goal has no pace to judge: no status badge, no Copilot callout (KAN-213).
  const isMeasured = goal.progressKind === 'ok' && goal.status !== null && !goal.isPaused;
  const style = goal.status ? STATUS_BADGE_STYLES[goal.status] : STATUS_BADGE_STYLES.on_track;
  const percentFilled = goal.percentFilled ?? 0;

  async function handleSaveTarget(): Promise<void> {
    setSaveError(null);
    const typed = goal.direction === 'range' ? [Number(minInput), Number(maxInput)] : [Number(targetInput)];
    const outOfRange = targetEntryError(typed, goal.unit);
    if (outOfRange) {
      setSaveError(outOfRange);
      return;
    }
    setIsSaving(true);
    try {
      const payload =
        goal.direction === 'range'
          ? { rangeMin: storedGoalTarget(Number(minInput), goal.unit), rangeMax: storedGoalTarget(Number(maxInput), goal.unit) }
          : { targetValue: storedGoalTarget(Number(targetInput), goal.unit) };

      const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Only reflect the new target once it was actually saved - a failed PATCH used to update
      // the card anyway, showing a target that exists nowhere.
      if (!res.ok) {
        setSaveError(t('targetUpdateError'));
        return;
      }

      onTargetUpdated?.(goal.id, payload);
      setIsEditingTarget(false);
    } catch {
      setSaveError(t('targetUpdateError'));
    } finally {
      setIsSaving(false);
    }
  }

  const targetText =
    goal.direction === 'range'
      ? `${show(goal.rangeMin ?? 0)} - ${show(goal.rangeMax ?? 0)}`
      : show(goal.targetValue ?? 0);

  return (
    <div
      data-testid={`goal-card-${goal.id}`}
      className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/30"
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {goal.metricName}
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground">{goal.name}</h3>
          </div>

          {goal.isPaused ? (
            <span data-testid={`goal-paused-${goal.id}`} className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {t('pausedBadge')}
            </span>
          ) : null}
          {isMeasured && goal.status ? (
            <div className="flex items-center gap-2">
              <span
                data-testid={`goal-status-${goal.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                {t(`paceStatus.${goal.status}`)}
              </span>
            </div>
          ) : null}
        </div>

        {isMeasured ? (
          /* Thermometer Gauge */
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {t('progressLabel')}{': '}
                <span dir="ltr">{`${percentFilled}%`}</span>
              </span>
              <span className="font-bold text-foreground" dir="ltr">
                {`${show(goal.actualValue ?? 0)} / ${targetText}`}
              </span>
            </div>

            {/* Animated Bar with Milestone Markers */}
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                data-testid={`goal-bar-${goal.id}`}
                role="progressbar"
                aria-valuenow={percentFilled}
                aria-valuemin={0}
                aria-valuemax={100}
                className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                style={{ width: `${Math.min(100, Math.max(2, percentFilled))}%` }}
              />
            </div>

            {/* Expected vs Projected Timeline Strip */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {t('expectedAtNowLabel')}{': '}
                <strong className="text-foreground" dir="ltr">{show(goal.expectedAtNow ?? 0)}</strong>
              </span>
              <span data-testid={`goal-projection-${goal.id}`}>
                {t('projectedFinalValueLabel')}{': '}
                <strong className="text-foreground" dir="ltr">{show(goal.projectedFinalValue ?? 0)}</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">
              {t('columnTarget')}{': '}
              <strong className="text-foreground" dir="ltr">{targetText}</strong>
            </span>
            <p
              data-testid={`goal-progress-unavailable-${goal.id}`}
              className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-muted-foreground"
            >
              {t(`thermometerUnavailableReason.${goal.progressKind}`)}
            </p>
          </div>
        )}
      </div>

      {/* Footer Details & Quick Action */}
      <div className="mt-5 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {goal.daysRemaining > 0
                ? t('timeElapsed', {
                    percent: Math.round(goal.elapsedFraction * 100),
                    daysRemaining: goal.daysRemaining,
                  })
                : t('timeElapsedFinished')}
            </span>
          </div>

          {/* Inline Target Edit Trigger */}
          {canExecute && !isEditingTarget && (
            <button
              type="button"
              data-testid={`adjust-target-btn-${goal.id}`}
              onClick={() => setIsEditingTarget(true)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              <Edit2 className="h-3 w-3" />
              <span>{t('editTarget')}</span>
            </button>
          )}

          {canExecute && isEditingTarget && (
            <div className="flex items-center gap-1">
              {goal.direction === 'range' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    data-testid={`input-range-min-${goal.id}`}
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    className="h-6 w-14 rounded border border-input px-1 text-xs bg-background"
                  />
                  <span>{'-'}</span>
                  <input
                    type="number"
                    data-testid={`input-range-max-${goal.id}`}
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    className="h-6 w-14 rounded border border-input px-1 text-xs bg-background"
                  />
                </div>
              ) : (
                <input
                  type="number"
                  data-testid={`input-target-${goal.id}`}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="h-6 w-20 rounded border border-input px-1 text-xs bg-background"
                />
              )}
              <button
                type="button"
                data-testid={`save-target-btn-${goal.id}`}
                disabled={isSaving}
                onClick={handleSaveTarget}
                className="rounded bg-primary p-1 text-primary-foreground hover:bg-primary/90 cursor-pointer"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                data-testid={`cancel-target-btn-${goal.id}`}
                onClick={() => setIsEditingTarget(false)}
                className="rounded bg-muted p-1 text-muted-foreground hover:bg-muted/80 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {saveError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {saveError}
          </p>
        ) : null}

        {/* Proactive Copilot Callout - only for a MEASURED at-risk / off-track goal */}
        {isMeasured && goal.status !== 'on_track' && onOptimizeRequested && (
          <div
            data-testid={`goal-rec-card-${goal.id}`}
            className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="line-clamp-1">{t('smartRecDescription')}</span>
            </div>
            <button
              type="button"
              data-testid={`goal-rec-action-btn-${goal.id}`}
              onClick={() => onOptimizeRequested(goal)}
              className="shrink-0 rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700 cursor-pointer"
            >
              {t('smartRecAction')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import type { GoalItem } from './goal-types';
import { GoalThermometer } from './goal-thermometer';
import { calculateGoalProgress } from './goal-progress-calc';

export interface GoalThermometerCardProps {
  goal: GoalItem;
  canExecute?: boolean;
  onTargetUpdated?: (goalId: string, newTarget: number) => void;
  onOptimizeRequested?: (goal: GoalItem) => void;
  onDeleteRequested?: (goalId: string) => void;
  className?: string;
}

export function GoalThermometerCard({
  goal,
  canExecute = false,
  onTargetUpdated,
  onOptimizeRequested,
  onDeleteRequested,
  className = '',
}: GoalThermometerCardProps): React.ReactElement {
  const t = useTranslations('Goals');
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(goal.targetValue.toString());
  const [isSaving, setIsSaving] = useState(false);

  const progress =
    goal.progress ||
    calculateGoalProgress({
      direction: goal.direction,
      targetValue: goal.targetValue,
      actualValue: goal.actualValue,
      rangeMin: goal.rangeMin,
      rangeMax: goal.rangeMax,
      startDate: goal.startDate,
      deadline: goal.deadline,
      elapsedFraction: 0.6,
    });

  const handleSaveTarget = () => {
    const num = parseFloat(targetInput);
    if (!isNaN(num) && num > 0) {
      setIsSaving(true);
      onTargetUpdated?.(goal.id, num);
      setIsEditingTarget(false);
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid={`goal-card-${goal.id}`}
      className={`group flex flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-border hover:shadow-sm ${className}`}
    >
      {/* Header Row: Goal Name, Metric Pill, Pace Badge */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-foreground tracking-tight truncate">
                {goal.name}
              </h3>
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {goal.metricLabel || goal.metricKey}
              </span>
            </div>

            {/* Target and Deadline Sub-row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span dir="ltr">Deadline: {goal.deadline}</span>
              </div>
              {goal.ownerName && (
                <div className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  <span>{goal.ownerName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pace Badge */}
          <span
            data-testid={`goal-status-${goal.id}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 ${
              progress.status === 'on_track'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                : progress.status === 'at_risk'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
            }`}
          >
            {progress.status === 'on_track' ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                <span>{t('paceStatus.on_track')}</span>
              </>
            ) : progress.status === 'at_risk' ? (
              <>
                <AlertTriangle className="h-3 w-3" />
                <span>{t('paceStatus.at_risk')}</span>
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3" />
                <span>{t('paceStatus.off_track')}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Thermometer Visual Progress */}
      <div className="mt-1">
        <GoalThermometer
          goal={goal}
          progress={progress}
          showLabels={true}
        />
      </div>

      {/* Statistical Projection & Projected Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span>Projected Pace:</span>
          <span
            data-testid={`goal-projection-${goal.id}`}
            dir="ltr"
            className="font-bold text-foreground"
          >
            {progress.projectedFinalValue.toLocaleString()} ({progress.percentFilled}%)
          </span>
        </div>

        {progress.projectedCompletionDate && (
          <div className="text-[11px] text-muted-foreground" dir="ltr">
            Est. Target Met: <strong className="text-foreground">{progress.projectedCompletionDate}</strong>
          </div>
        )}
      </div>

      {/* Action Footer: Inline Target Update & Copilot Optimization */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60 text-xs">
        {isEditingTarget ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              data-testid={`edit-target-input-${goal.id}`}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              data-testid={`save-target-btn-${goal.id}`}
              onClick={handleSaveTarget}
              disabled={isSaving}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditingTarget(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {canExecute && onTargetUpdated && (
              <button
                type="button"
                data-testid={`edit-target-trigger-${goal.id}`}
                onClick={() => setIsEditingTarget(true)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium cursor-pointer"
              >
                <Edit2 className="h-3 w-3" />
                <span>Adjust Target</span>
              </button>
            )}

            {canExecute && onDeleteRequested && (
              <button
                type="button"
                data-testid={`delete-goal-trigger-${goal.id}`}
                onClick={() => onDeleteRequested(goal.id)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}

        {/* Ask Copilot Optimization trigger */}
        {progress.status !== 'on_track' && (
          <button
            type="button"
            data-testid={`optimize-goal-btn-${goal.id}`}
            onClick={() => onOptimizeRequested?.(goal)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline ms-auto cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Accelerate Goal with Copilot</span>
          </button>
        )}
      </div>
    </div>
  );
}

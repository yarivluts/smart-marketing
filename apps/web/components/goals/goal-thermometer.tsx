'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { GoalItem, GoalProgressCalculation } from './goal-types';
import { calculateGoalProgress } from './goal-progress-calc';

export interface GoalThermometerProps {
  goal?: GoalItem;
  targetValue?: number;
  actualValue?: number;
  direction?: 'maximize' | 'minimize' | 'range';
  rangeMin?: number | null;
  rangeMax?: number | null;
  progress?: GoalProgressCalculation;
  showLabels?: boolean;
  className?: string;
}

export function GoalThermometer({
  goal,
  targetValue: passedTarget,
  actualValue: passedActual,
  direction: passedDirection = 'maximize',
  rangeMin: passedMin,
  rangeMax: passedMax,
  progress: passedProgress,
  showLabels = true,
  className = '',
}: GoalThermometerProps): React.ReactElement {
  const t = useTranslations('Goals');

  const targetValue = goal?.targetValue ?? passedTarget ?? 100;
  const actualValue = goal?.actualValue ?? passedActual ?? 0;
  const direction = goal ? goal.direction : passedDirection;
  const rangeMin = goal ? goal.rangeMin : passedMin;
  const rangeMax = goal ? goal.rangeMax : passedMax;

  const progress =
    passedProgress ||
    (goal?.progress
      ? goal.progress
      : calculateGoalProgress({
          direction,
          targetValue,
          actualValue,
          rangeMin,
          rangeMax,
          elapsedFraction: 0.6,
        }));

  const isRange = direction === 'range';
  const isMinimize = direction === 'minimize';

  const barColor =
    progress.status === 'on_track'
      ? 'bg-emerald-500'
      : progress.status === 'at_risk'
        ? 'bg-amber-500'
        : 'bg-rose-500';

  const fillWidth = Math.min(100, Math.max(2, progress.percentFilled));

  return (
    <div data-testid="goal-thermometer" className={`flex flex-col gap-2.5 ${className}`}>
      {/* Top Details Row */}
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {t('actualValueLabel')}:{' '}
              <strong dir="ltr" className="text-sm font-bold text-foreground">
                {actualValue.toLocaleString()}
              </strong>
            </span>
            {isRange && typeof rangeMin === 'number' && typeof rangeMax === 'number' ? (
              <span className="text-muted-foreground" dir="ltr">
                (Target Range: {rangeMin.toLocaleString()} - {rangeMax.toLocaleString()})
              </span>
            ) : (
              <span className="text-muted-foreground" dir="ltr">
                ({t('columnTarget')}: {targetValue.toLocaleString()})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              data-testid="goal-pace-badge"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
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
      )}

      {/* Thermometer Bar Track */}
      <div className="relative h-3.5 w-full rounded-full bg-muted/80 overflow-hidden shadow-inner">
        {/* Fill Bar */}
        <div
          data-testid="goal-thermometer-fill"
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${fillWidth}%` }}
        />

        {/* Target Benchmark Notch (if maximize) */}
        {!isRange && !isMinimize && targetValue > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
            style={{ left: '100%', transform: 'translateX(-100%)' }}
            title={`Target: ${targetValue}`}
          />
        )}
      </div>

      {/* Projection & Pacing Sub-text */}
      {showLabels && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span dir="ltr">
            {t('expectedAtNowLabel')}: {progress.expectedAtNow.toFixed(0)}
          </span>
          <span data-testid="goal-projection" dir="ltr" className="font-semibold text-foreground">
            {t('projectedFinalValueLabel')}: {progress.projectedFinalValue.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Sparkles,
  Users,
  CheckCircle2,
  ArrowDownRight,
} from 'lucide-react';
import type { FunnelStepItem } from '@/lib/orgs/funnel-goals-synthesizer';
import { createMockEasySignFunnel } from '@/lib/orgs/funnel-goals-synthesizer';

export interface VisualFunnelStepsProps {
  steps?: FunnelStepItem[];
  funnelName?: string;
  isSimulated?: boolean;
  onAskCopilot?: () => void;
  className?: string;
}

export function VisualFunnelSteps({
  steps: passedSteps,
  funnelName = 'EasySign',
  isSimulated = false,
  onAskCopilot,
  className = '',
}: VisualFunnelStepsProps): React.ReactElement {
  const t = useTranslations('Funnel');
  const steps = passedSteps && passedSteps.length > 0 ? passedSteps : createMockEasySignFunnel();

  const totalStarted = steps[0]?.customerCount ?? 0;
  const totalCompleted = steps[steps.length - 1]?.customerCount ?? 0;
  const overallConversion = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

  // Find biggest drop-off stage
  let highestDropOffStep: FunnelStepItem | null = null;
  for (let i = 1; i < steps.length; i++) {
    if (!highestDropOffStep || steps[i].dropOffPercent > highestDropOffStep.dropOffPercent) {
      highestDropOffStep = steps[i];
    }
  }

  return (
    <div
      data-testid="visual-funnel-container"
      className={`flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-xs ${className}`}
    >
      {/* Header & Status Badges */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('visualFunnelHeading', { funnelName })}
            </h2>
            {isSimulated && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {t('simulatedBadge')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{t('visualFunnelSubtitle')}</p>
        </div>

        {/* Funnel High-Level Summary Stats */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{t('totalStarted')}{':'}</span>
            <span className="font-bold text-foreground" dir="ltr">
              {totalStarted.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
            <span>{t('totalCompleted')}{':'}</span>
            <span className="font-bold text-foreground" dir="ltr">
              {totalCompleted.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-primary">
            <span>{t('overallConversion')}{':'}</span>
            <span className="font-bold" dir="ltr">
              {`${overallConversion}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Pipeline Stages */}
      <div className="mt-2 flex flex-col gap-4">
        {steps.map((step, idx) => {
          const isHighestDropOff = highestDropOffStep?.stageKey === step.stageKey && step.dropOffPercent > 0;

          return (
            <div
              key={step.stageKey}
              data-testid={`funnel-step-${step.stageKey}`}
              className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border p-4 transition-all ${
                isHighestDropOff
                  ? 'border-amber-300/80 bg-amber-50/20 dark:border-amber-800/50 dark:bg-amber-950/10 shadow-2xs'
                  : 'border-border/70 bg-card hover:border-border'
              }`}
            >
              {/* Step Number */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">
                <span dir="ltr">{`${step.stepOrder}.`}</span>
              </div>

              {/* Progress & Label Bar */}
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="truncate text-foreground font-semibold">
                    {step.stageLabel}
                  </span>
                  <span
                    data-testid={`count-${step.stageKey}`}
                    className="text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {`${step.customerCount} ${t('usersUnit')}`}
                  </span>
                </div>

                {/* Conversion Bar */}
                <div className="mt-2 h-3.5 w-full rounded-full bg-muted/80 overflow-hidden">
                  <div
                    data-testid={`bar-${step.stageKey}`}
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(2, Math.min(100, step.conversionPercent))}%` }}
                  />
                </div>
              </div>

              {/* Step Metrics: Conversion % & Drop-off % */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-28 shrink-0 gap-1 text-end">
                <span
                  data-testid={`pct-${step.stageKey}`}
                  className="text-sm font-bold text-foreground"
                  dir="ltr"
                >
                  {`${step.conversionPercent}%`}
                </span>

                {idx > 0 && (
                  <div
                    data-testid={`dropoff-${step.stageKey}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
                    dir="ltr"
                  >
                    <ArrowDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{`-${step.dropOffPercent}% ${t('dropOffLabel')}`}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Proactive In-Context Drop-off AI Recommendation Card */}
      {highestDropOffStep && highestDropOffStep.dropOffPercent >= 40 && (
        <div
          data-testid="funnel-dropoff-alert-card"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 dark:border-amber-800/60"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                {t('highDropoffAlertHeading')}
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">
                {t('dropoffAlertMessage', {
                  stage: highestDropOffStep.stageLabel,
                  percent: highestDropOffStep.dropOffPercent,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="ask-copilot-btn"
            onClick={onAskCopilot}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all shrink-0 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('optimizeDropoffButton')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

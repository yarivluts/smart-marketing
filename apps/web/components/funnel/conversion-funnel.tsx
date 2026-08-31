'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, X } from 'lucide-react';
import type { FunnelStep, FunnelSummaryMetrics, FunnelChannelFilter } from './funnel-types';
import { FunnelStepCard } from './funnel-step-card';
import { FunnelFlowConnector } from './funnel-flow-connector';
import { FunnelKpiSummary } from './funnel-kpi-summary';

export interface ConversionFunnelProps {
  steps?: FunnelStep[];
  funnelName?: string;
  isSimulated?: boolean;
  onAskCopilot?: () => void;
  className?: string;
}

export const DEFAULT_EASYSIGN_STEPS: FunnelStep[] = [
  {
    stageKey: 'sent',
    stepOrder: 1,
    stageLabel: 'Document Sent',
    customerCount: 1000,
    conversionPercent: 100,
    dropOffPercent: 0,
    avgDurationHours: 0,
  },
  {
    stageKey: 'viewed',
    stepOrder: 2,
    stageLabel: 'Document Viewed',
    customerCount: 380,
    conversionPercent: 38,
    dropOffPercent: 62,
    isBottleneck: true,
    avgDurationHours: 14.2,
  },
  {
    stageKey: 'signed',
    stepOrder: 3,
    stageLabel: 'Document Signed',
    customerCount: 220,
    conversionPercent: 22,
    dropOffPercent: 42,
    avgDurationHours: 4.8,
  },
];

export function ConversionFunnel({
  steps: passedSteps,
  funnelName = 'EasySign',
  isSimulated = false,
  onAskCopilot,
  className = '',
}: ConversionFunnelProps): React.ReactElement {
  const t = useTranslations('Funnel');
  const [selectedChannel, setSelectedChannel] = useState<FunnelChannelFilter>('all');
  const [selectedStep, setSelectedStep] = useState<FunnelStep | null>(null);

  const initialSteps = passedSteps && passedSteps.length > 0 ? passedSteps : DEFAULT_EASYSIGN_STEPS;

  // Filter steps by channel if applicable
  const steps = useMemo(() => {
    if (selectedChannel === 'all') return initialSteps;
    const factor = selectedChannel === 'meta' ? 0.85 : selectedChannel === 'google' ? 1.15 : 0.9;
    return initialSteps.map((s) => {
      if (s.stepOrder === 1) return s;
      const count = Math.round(s.customerCount * factor);
      const conv = Math.round((count / (initialSteps[0]?.customerCount || 1000)) * 100);
      const prevCount = Math.round((initialSteps[s.stepOrder - 2]?.customerCount || 1000) * (s.stepOrder === 2 ? 1 : factor));
      const drop = Math.max(0, Math.round(((prevCount - count) / Math.max(1, prevCount)) * 100));
      return {
        ...s,
        customerCount: count,
        conversionPercent: conv,
        dropOffPercent: drop,
      };
    });
  }, [initialSteps, selectedChannel]);

  const totalStarted = steps[0]?.customerCount ?? 0;
  const totalCompleted = steps[steps.length - 1]?.customerCount ?? 0;
  const overallConversion = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

  // Find biggest drop-off stage
  const highestDropOffStep = useMemo(() => {
    let highest: FunnelStep | null = null;
    for (let i = 1; i < steps.length; i++) {
      if (!highest || steps[i].dropOffPercent > highest.dropOffPercent) {
        highest = steps[i];
      }
    }
    return highest;
  }, [steps]);

  const summaryMetrics: FunnelSummaryMetrics = {
    totalStarted,
    totalCompleted,
    overallConversionRate: overallConversion,
    highestDropOffStage: highestDropOffStep,
    avgVelocityDays: 3.8,
  };

  return (
    <div
      data-testid="visual-funnel-container"
      className={`flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-xs ${className}`}
    >
      {/* Top Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('visualFunnelHeading', { funnelName })}
            </h2>
            {isSimulated ? (
              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {t('simulatedBadge')}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {t('liveBadge')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{t('visualFunnelSubtitle')}</p>
        </div>

        {/* Channel Segment Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 p-1 text-xs">
          {(['all', 'meta', 'google', 'email'] as const).map((channel) => (
            <button
              key={channel}
              type="button"
              data-testid={`channel-filter-${channel}`}
              onClick={() => setSelectedChannel(channel)}
              className={`rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer ${
                selectedChannel === channel
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {channel === 'all'
                ? 'All Channels'
                : channel.charAt(0).toUpperCase() + channel.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Summary Scorecards */}
      <FunnelKpiSummary metrics={summaryMetrics} />

      {/* Multi-step Visual Funnel Grid with Connectors */}
      <div className="mt-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2">
        {steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === steps.length - 1;
          const isHighest = highestDropOffStep?.stageKey === step.stageKey && step.dropOffPercent > 0;
          const isSelected = selectedStep?.stageKey === step.stageKey;

          return (
            <React.Fragment key={step.stageKey}>
              {/* Connector between steps */}
              {idx > 0 && (
                <FunnelFlowConnector
                  dropOffPercent={step.dropOffPercent}
                  fromStageLabel={steps[idx - 1]?.stageLabel}
                  toStageLabel={step.stageLabel}
                />
              )}

              {/* Step Card */}
              <div className="flex-1 min-w-0">
                <FunnelStepCard
                  step={step}
                  isFirst={isFirst}
                  isLast={isLast}
                  isHighestDropOff={isHighest}
                  isSelected={isSelected}
                  onSelect={(s) => setSelectedStep(s)}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Detail Drilldown Drawer / Card */}
      {selectedStep && (
        <div
          data-testid="funnel-step-drilldown"
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                {selectedStep.stepOrder}
              </span>
              <h4 className="text-sm font-bold text-foreground">
                Stage Breakdown: {selectedStep.stageLabel}
              </h4>
            </div>
            <button
              type="button"
              data-testid="close-drilldown-btn"
              onClick={() => setSelectedStep(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-card p-2.5 border border-border/70">
              <span className="text-muted-foreground">Volume</span>
              <p className="font-bold text-foreground text-sm mt-0.5" dir="ltr">
                {selectedStep.customerCount.toLocaleString()} users
              </p>
            </div>
            <div className="rounded-lg bg-card p-2.5 border border-border/70">
              <span className="text-muted-foreground">Conversion Rate</span>
              <p className="font-bold text-foreground text-sm mt-0.5" dir="ltr">
                {selectedStep.conversionPercent}%
              </p>
            </div>
            <div className="rounded-lg bg-card p-2.5 border border-border/70">
              <span className="text-muted-foreground">Stage Drop-off</span>
              <p className="font-bold text-destructive text-sm mt-0.5" dir="ltr">
                {selectedStep.dropOffPercent > 0 ? `-${selectedStep.dropOffPercent}%` : '0%'}
              </p>
            </div>
            <div className="rounded-lg bg-card p-2.5 border border-border/70">
              <span className="text-muted-foreground">Avg Time in Stage</span>
              <p className="font-bold text-foreground text-sm mt-0.5" dir="ltr">
                {selectedStep.avgDurationHours ? `${selectedStep.avgDurationHours}h` : 'Instant'}
              </p>
            </div>
          </div>
        </div>
      )}

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

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Users, TrendingUp, Filter } from 'lucide-react';
import type { CohortHeatmapRow } from '@/lib/orgs/funnel-goals-synthesizer';

export interface CohortRetentionMatrixProps {
  cohorts: CohortHeatmapRow[];
  periodNumbers: number[];
  conversionEvent?: string;
  onSelectConversionEvent?: (event: string) => void;
  projectName?: string;
}

export function CohortRetentionMatrix({
  cohorts,
  periodNumbers,
  conversionEvent = '',
  onSelectConversionEvent,
  projectName = 'GrowthOS',
}: CohortRetentionMatrixProps): React.ReactElement {
  const t = useTranslations('CohortRetention');

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-xs"
      data-testid="cohort-retention-matrix"
    >
      {/* Header & Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground sm:text-lg">
            {t('title', { projectName })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('description')}
          </p>
        </div>

        {/* Conversion Event Filter Pills */}
        <div
          data-testid="cohort-event-filters"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1 text-xs"
        >
          <Filter className="h-3.5 w-3.5 text-muted-foreground ms-1" aria-hidden="true" />
          <button
            type="button"
            data-testid="filter-all-activity"
            onClick={() => onSelectConversionEvent?.('')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              !conversionEvent
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterAllActivity')}
          </button>
          <button
            type="button"
            data-testid="filter-purchases"
            onClick={() => onSelectConversionEvent?.('purchase')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              conversionEvent === 'purchase'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterPurchases')}
          </button>
          <button
            type="button"
            data-testid="filter-sign-ins"
            onClick={() => onSelectConversionEvent?.('sign_in')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              conversionEvent === 'sign_in'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterSignIns')}
          </button>
        </div>
      </div>

      {/* Heatmap Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-muted-foreground">
              <th className="py-2.5 px-3 text-start font-semibold">{t('cohortColumnHeading')}</th>
              <th className="py-2.5 px-3 text-end font-semibold">{t('cohortSizeColumnHeading')}</th>
              {periodNumbers.map((periodNumber) => (
                <th key={periodNumber} className="py-2.5 px-3 text-center font-semibold min-w-[72px]">
                  {t('periodColumnHeading', { periodNumber })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr
                key={cohort.cohortMonth}
                data-testid={`cohort-row-${cohort.cohortMonth}`}
                className="border-b border-border/60 hover:bg-muted/20 transition-colors"
              >
                {/* Cohort Month */}
                <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">
                  {cohort.cohortLabel}
                </td>
                {/* Cohort Size */}
                <td className="py-2.5 px-3 text-end font-medium text-muted-foreground whitespace-nowrap" dir="ltr">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {cohort.cohortSize.toLocaleString()}
                  </span>
                </td>
                {/* Period Retention Cells */}
                {periodNumbers.map((periodNumber) => {
                  const periodData = cohort.retentionByPeriod.get(periodNumber);
                  if (!periodData) {
                    return (
                      <td key={periodNumber} className="py-2 px-2 text-center text-muted-foreground/40 bg-muted/10">
                        {'—'}
                      </td>
                    );
                  }

                  return (
                    <td key={periodNumber} className="p-1.5 text-center">
                      <div
                        data-testid={`retention-cell-${cohort.cohortMonth}-p${periodNumber}`}
                        className={`rounded-md py-1 px-1.5 text-xs transition-all ${periodData.colorClass}`}
                        title={`${periodData.retainedCount} of ${cohort.cohortSize} users retained (${periodData.retentionRatePercent}%)`}
                      >
                        <span dir="ltr">{`${periodData.retentionRatePercent}%`}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Retention Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{t('legendLabel')}{':'}</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
            <span dir="ltr">{'≥ 80%'}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500/70" />
            <span dir="ltr">{'60-79%'}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500/35" />
            <span dir="ltr">{'40-59%'}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500/30" />
            <span dir="ltr">{'20-39%'}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500/20" />
            <span dir="ltr">{'< 20%'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('cohortHealthPositiveNotice')}</span>
        </div>
      </div>
    </div>
  );
}

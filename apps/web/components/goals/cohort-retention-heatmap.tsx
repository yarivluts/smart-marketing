'use client';

import React, { useState } from 'react';
import { Users } from 'lucide-react';
import type { CohortHeatmapRow, CohortPeriodData } from './goal-types';
import { getRetentionColorClass } from './goal-progress-calc';

export interface CohortRetentionHeatmapProps {
  cohorts?: CohortHeatmapRow[];
  periodNumbers?: number[];
  conversionEvent?: string;
  onSelectConversionEvent?: (event: string) => void;
  projectName?: string;
  className?: string;
}

export const DEFAULT_COHORTS: CohortHeatmapRow[] = [
  {
    cohortMonth: '2026-05',
    cohortLabel: 'May 2026',
    cohortSize: 120,
    periods: [
      { periodNumber: 0, retainedCount: 120, retentionRatePercent: 100 },
      { periodNumber: 1, retainedCount: 82, retentionRatePercent: 68 },
      { periodNumber: 2, retainedCount: 65, retentionRatePercent: 54 },
      { periodNumber: 3, retainedCount: 58, retentionRatePercent: 48 },
    ],
  },
  {
    cohortMonth: '2026-06',
    cohortLabel: 'Jun 2026',
    cohortSize: 150,
    periods: [
      { periodNumber: 0, retainedCount: 150, retentionRatePercent: 100 },
      { periodNumber: 1, retainedCount: 108, retentionRatePercent: 72 },
      { periodNumber: 2, retainedCount: 87, retentionRatePercent: 58 },
    ],
  },
  {
    cohortMonth: '2026-07',
    cohortLabel: 'Jul 2026',
    cohortSize: 180,
    periods: [
      { periodNumber: 0, retainedCount: 180, retentionRatePercent: 100 },
      { periodNumber: 1, retainedCount: 135, retentionRatePercent: 75 },
    ],
  },
];

export function CohortRetentionHeatmap({
  cohorts: passedCohorts,
  periodNumbers: passedPeriods = [0, 1, 2, 3],
  conversionEvent = 'all',
  onSelectConversionEvent,
  projectName: _projectName = 'GrowthOS',
  className = '',
}: CohortRetentionHeatmapProps): React.ReactElement {
  const [activeEvent, setActiveEvent] = useState(conversionEvent);
  const [selectedCell, setSelectedCell] = useState<{
    cohortLabel: string;
    period: number;
    size: number;
    retained: number;
    rate: number;
  } | null>(null);

  const cohorts = passedCohorts && passedCohorts.length > 0 ? passedCohorts : DEFAULT_COHORTS;
  const periodNumbers = passedPeriods.length > 0 ? passedPeriods : [0, 1, 2, 3];

  const handleEventChange = (evt: string) => {
    setActiveEvent(evt);
    onSelectConversionEvent?.(evt);
  };

  return (
    <div
      data-testid="cohort-matrix"
      className={`flex flex-col gap-5 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Cohort Retention Heatmap
            </h3>
            <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Monthly Cadence
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Color-graded retention matrix tracking customer lifecycle retention over monthly intervals.
          </p>
        </div>

        {/* Conversion Event Filter Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/40 p-1 text-xs">
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'purchases', label: 'Purchases' },
            { id: 'signins', label: 'Sign-ins' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`event-filter-${item.id}`}
              onClick={() => handleEventChange(item.id)}
              className={`rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer ${
                activeEvent === item.id
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap Data Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-xs text-center border-collapse">
          <thead>
            <tr className="border-b border-border/80 bg-muted/50 text-muted-foreground font-semibold">
              <th className="py-3 px-4 text-start font-bold text-foreground">Cohort</th>
              <th className="py-3 px-3">Users</th>
              {periodNumbers.map((p) => (
                <th key={p} className="py-3 px-3 min-w-[70px]">
                  {`M${p}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {cohorts.map((c) => {
              const periodMap = new Map<number, CohortPeriodData>();
              c.periods.forEach((p) => periodMap.set(p.periodNumber, p));

              return (
                <tr
                  key={c.cohortMonth}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2.5 px-4 text-start font-medium text-foreground">
                    <span>{c.cohortMonth}</span>
                    <span className="ms-2 text-[11px] text-muted-foreground hidden sm:inline">
                      ({c.cohortLabel})
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-foreground" dir="ltr">
                    {c.cohortSize.toLocaleString()}
                  </td>
                  {periodNumbers.map((pNum) => {
                    const data = periodMap.get(pNum);
                    const rate = data ? data.retentionRatePercent : null;
                    const colorCls = getRetentionColorClass(rate);

                    return (
                      <td
                        key={pNum}
                        className="py-1 px-1.5"
                      >
                        {rate !== null ? (
                          <button
                            type="button"
                            data-testid={`cohort-cell-${c.cohortMonth}-m${pNum}`}
                            onClick={() =>
                              setSelectedCell({
                                cohortLabel: c.cohortLabel,
                                period: pNum,
                                size: c.cohortSize,
                                retained: data?.retainedCount ?? Math.round((c.cohortSize * rate) / 100),
                                rate,
                              })
                            }
                            className={`w-full py-1.5 px-2 rounded-lg text-xs transition-all transform hover:scale-105 cursor-pointer ${colorCls}`}
                            title={`M${pNum}: ${rate}% (${data?.retainedCount ?? 0} users)`}
                          >
                            <span dir="ltr">{`${rate}%`}</span>
                          </button>
                        ) : (
                          <div className="py-1.5 px-2 rounded-lg bg-muted/20 text-muted-foreground/50 text-xs">
                            -
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Interactive Drilldown Details Card */}
      {selectedCell && (
        <div
          data-testid="cohort-cell-drilldown"
          className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/20 p-3.5 text-xs animate-fade-in"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                {selectedCell.cohortLabel} ֲ· Month {selectedCell.period} Retention
              </p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                <strong className="text-foreground" dir="ltr">{selectedCell.retained}</strong> out of{' '}
                <strong className="text-foreground" dir="ltr">{selectedCell.size}</strong> users retained ({selectedCell.rate}%)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCell(null)}
            className="text-xs text-muted-foreground hover:text-foreground font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
        <div className="flex items-center gap-2">
          <span>Retention Legend:</span>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded bg-emerald-500 text-center text-[9px] text-white font-bold">
              80%+
            </span>
            <span className="inline-block h-3 w-5 rounded bg-emerald-500/70 text-center text-[9px] text-white">
              60%+
            </span>
            <span className="inline-block h-3 w-5 rounded bg-emerald-500/35 text-center text-[9px]">
              40%+
            </span>
            <span className="inline-block h-3 w-5 rounded bg-amber-500/30 text-center text-[9px]">
              25%+
            </span>
            <span className="inline-block h-3 w-5 rounded bg-rose-500/20 text-center text-[9px]">
              &lt;25%
            </span>
          </div>
        </div>

        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
          Avg Month 1 Retention: 71.6% (Healthy)
        </span>
      </div>
    </div>
  );
}

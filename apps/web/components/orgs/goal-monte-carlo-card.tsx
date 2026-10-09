'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  Hourglass,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { GoalForecastView } from '@/lib/orgs/goal-view';
import { PpCard, PpPill, type PpAccent } from '@/components/pastel/primitives';

export interface GoalMonteCarloCardProps {
  forecast: GoalForecastView;
  targetValue: number;
  direction: string;
  metricName: string;
  deadline: string;
}

export function GoalMonteCarloCard({
  forecast,
  targetValue,
  direction,
  metricName,
  deadline,
}: GoalMonteCarloCardProps): React.ReactElement {
  const t = useTranslations('Goals');

  // SVG dimensions & scale calculations
  const width = 600;
  const height = 220;
  const padX = 40;
  const padYTop = 30;
  const padYBottom = 180;
  const chartWidth = width - padX * 2;
  const chartHeight = padYBottom - padYTop;

  const maxYValue = Math.max(
    targetValue * 1.15,
    forecast.p90 * 1.1,
    forecast.p50 * 1.1,
    forecast.p10 * 1.1,
    1,
  );

  const getY = (val: number): number => {
    const clamped = Math.max(0, val);
    const fraction = clamped / maxYValue;
    return padYBottom - fraction * chartHeight;
  };

  const getX = (elapsedFraction: number): number => {
    return padX + elapsedFraction * chartWidth;
  };

  // Build corridor polygon points (upper P90 curve left-to-right, then lower P10 curve right-to-left)
  const spline = forecast.trajectorySpline;
  const upperPoints = spline.map((pt) => `${getX(pt.elapsedFraction).toFixed(1)},${getY(pt.p90).toFixed(1)}`);
  const lowerPoints = [...spline]
    .reverse()
    .map((pt) => `${getX(pt.elapsedFraction).toFixed(1)},${getY(pt.p10).toFixed(1)}`);
  const corridorPolygonString = `${upperPoints.join(' ')} ${lowerPoints.join(' ')}`;

  // Build actual curve points (historical) and projected curve points (future)
  const actualPoints = spline.filter((pt) => pt.actual !== null);
  const futurePoints = spline.filter((pt) => pt.actual === null);
  // Include the last actual point as the anchor for the future projection line
  const projectionPoints = actualPoints.length > 0
    ? [actualPoints[actualPoints.length - 1], ...futurePoints]
    : spline;

  const actualPath = actualPoints.length > 0
    ? `M ${actualPoints.map((pt) => `${getX(pt.elapsedFraction).toFixed(1)},${getY(pt.actual ?? 0).toFixed(1)}`).join(' L ')}`
    : '';

  const projectionPath = projectionPoints.length > 1
    ? `M ${projectionPoints.map((pt) => `${getX(pt.elapsedFraction).toFixed(1)},${getY(pt.p50).toFixed(1)}`).join(' L ')}`
    : '';

  // Expected target baseline (dashed line from 0 to target at deadline)
  const targetBaselineY = getY(targetValue);

  // Status accents
  const prob = forecast.completionProbability;
  const probAccent: PpAccent = prob >= 0.75 ? 'mint' : prob >= 0.45 ? 'amber' : 'error';

  return (
    <PpCard
      title={t('monteCarloTitle')}
      subtitle={t('monteCarloSubtitle')}
      icon={Sparkles}
      iconAccent="primary"
      action={
        <div className="flex items-center gap-2">
          <PpPill accent={probAccent} dot>
            {t('probabilityPill', { prob: forecast.probabilityFormatted })}
          </PpPill>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Trajectory Spline & Corridor Graph */}
        <div className="relative rounded-2xl bg-pp-surface-container-low/50 p-4 border border-pp-outline-variant/30">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-pp-on-surface">{t('pacingSplineHeader')}</span>
              <span className="text-pp-outline">• {t('simulationsCount', { count: forecast.simulatedRuns })}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-pp-outline">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-pp-primary" />
                <span>{t('actualLegend')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-pp-primary/50" />
                <span>{t('projectedLegend')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded bg-pp-primary-fixed/40 border border-pp-primary/20" />
                <span>{t('confidenceBandLegend')}</span>
              </span>
            </div>
          </div>

          <div className="w-full overflow-hidden">
            <svg
              className="w-full h-48 sm:h-56 select-none"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              aria-label="Monte Carlo Forecast Spline"
            >
              <defs>
                <linearGradient id="monteCarloCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7064f4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#7064f4" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="actualFillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5243d5" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#5243d5" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={padX} y1={padYTop} x2={width - padX} y2={padYTop} stroke="#e4e1ea" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={padX} y1={(padYTop + padYBottom) / 2} x2={width - padX} y2={(padYTop + padYBottom) / 2} stroke="#e4e1ea" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={padX} y1={padYBottom} x2={width - padX} y2={padYBottom} stroke="#e4e1ea" strokeWidth="1" />

              {/* Confidence Corridor Polygon (P10 to P90 band) */}
              <polygon
                points={corridorPolygonString}
                fill="url(#monteCarloCorridorGrad)"
                stroke="#c5c0ff"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />

              {/* Target Baseline (Dashed) */}
              <line
                x1={padX}
                y1={targetBaselineY}
                x2={width - padX}
                y2={targetBaselineY}
                stroke="#787586"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.6"
              />

              {/* Actual Cumulative Performance Curve */}
              {actualPath ? (
                <path
                  d={actualPath}
                  fill="none"
                  stroke="#5243d5"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Projected Forward Median Trajectory (Dashed) */}
              {projectionPath ? (
                <path
                  d={projectionPath}
                  fill="none"
                  stroke="#7064f4"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              ) : null}

              {/* Milestone & Target Nodes */}
              {spline.map((pt, i) => {
                const cx = getX(pt.elapsedFraction);
                const cy = pt.actual !== null ? getY(pt.actual) : getY(pt.p50);
                if (i === 0 || i === spline.length - 1 || pt.actual !== null) {
                  return (
                    <g key={pt.date}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={pt.actual !== null ? 4.5 : 3.5}
                        fill={pt.actual !== null ? '#5243d5' : '#7064f4'}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  );
                }
                return null;
              })}
            </svg>
          </div>

          {/* Time Scale Axis Labels */}
          <div className="mt-2 flex items-center justify-between border-t border-pp-outline-variant/30 pt-2 text-[11px] font-mono text-pp-outline">
            <span>{spline[0]?.date ?? 'Start'}</span>
            <span className="font-semibold text-pp-primary">{t('todayMarker')}</span>
            <span>{forecast.projectedCompletionDate ? `${t('projectedMarker')}: ${forecast.projectedCompletionDate}` : deadline}</span>
            <span>{deadline}</span>
          </div>
        </div>

        {/* 3-Column Velocity & Forecasting Insights Ribbon */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Velocity Uplift */}
          <div className="flex flex-col justify-between rounded-xl bg-pp-surface-container-low/60 p-3.5 border border-pp-outline-variant/20">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">
              {t('velocityUpliftLabel')}
            </span>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className={`text-lg font-bold font-mono ${forecast.velocityUpliftPct >= 0 ? 'text-pp-secondary' : 'text-amber-600'}`}>
                {forecast.velocityUpliftPct >= 0 ? `+${forecast.velocityUpliftPct}%` : `${forecast.velocityUpliftPct}%`}
              </span>
              <span className="text-xs text-pp-outline">{t('velocityLiftSuffix')}</span>
            </div>
            <p className="text-[11px] text-pp-on-surface-variant">
              {forecast.velocityUpliftPct >= 0
                ? t('velocityUpliftPositiveDesc')
                : t('velocityUpliftNegativeDesc')}
            </p>
          </div>

          {/* Projected Finish Date */}
          <div className="flex flex-col justify-between rounded-xl bg-pp-surface-container-low/60 p-3.5 border border-pp-outline-variant/20">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">
              {t('projectedFinishLabel')}
            </span>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-pp-primary">
                {forecast.projectedCompletionDate ?? t('unreachableByDeadline')}
              </span>
            </div>
            <p className="text-[11px] text-pp-on-surface-variant">
              {forecast.projectedDaysAheadOrBehind >= 0
                ? t('daysAheadOfDeadline', { days: forecast.projectedDaysAheadOrBehind })
                : t('daysBehindDeadline', { days: Math.abs(forecast.projectedDaysAheadOrBehind) })}
            </p>
          </div>

          {/* Confidence Corridor Interval */}
          <div className="flex flex-col justify-between rounded-xl bg-pp-surface-container-low/60 p-3.5 border border-pp-outline-variant/20">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">
              {t('confidenceCorridorLabel')}
            </span>
            <div className="my-1.5 flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-pp-on-surface">
                {forecast.probabilityFormatted}
              </span>
              <span className="text-xs text-pp-outline">P10: {forecast.p10.toLocaleString()} / P90: {forecast.p90.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-pp-on-surface-variant">
              {t('monteCarloDescription', { runs: forecast.simulatedRuns.toLocaleString() })}
            </p>
          </div>
        </div>

        {/* Milestone Sub-Breakdown & Attainment Ledger */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-pp-on-surface flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-pp-primary" aria-hidden />
              <span>{t('milestonesHeading')}</span>
            </h3>
            <span className="text-xs text-pp-outline">{t('milestonesSubtext')}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {forecast.milestones.map((m) => {
              const isAchieved = m.status === 'achieved';
              const isInFlight = m.status === 'in_flight';

              return (
                <div
                  key={m.percentage}
                  className={`relative flex flex-col justify-between rounded-2xl p-3.5 transition-all ${
                    isAchieved
                      ? 'bg-pp-secondary-container/20 border border-pp-secondary/30'
                      : isInFlight
                        ? 'bg-pp-surface-container-lowest border-2 border-pp-primary/40 shadow-sm'
                        : 'bg-pp-surface-container-low/40 border border-pp-outline-variant/30 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono font-bold text-pp-outline text-[11px]">
                      {m.percentage}% • {m.label}
                    </span>
                    {isAchieved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pp-secondary-container px-2 py-0.5 text-[10px] font-bold text-pp-on-secondary-container">
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        <span>{t('milestoneAchieved')}</span>
                      </span>
                    ) : isInFlight ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pp-primary-fixed px-2 py-0.5 text-[10px] font-bold text-pp-on-primary-fixed animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-pp-primary" />
                        <span>{t('milestoneInFlight')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container px-2 py-0.5 text-[10px] font-bold text-pp-outline">
                        <Clock className="h-3 w-3" aria-hidden />
                        <span>{t('milestoneUpcoming')}</span>
                      </span>
                    )}
                  </div>

                  <div className="my-1 text-xl font-bold font-mono text-pp-on-surface">
                    {m.targetValue.toLocaleString()}
                  </div>

                  <div className="border-t border-pp-outline-variant/20 pt-2 text-[11px] text-pp-outline">
                    {isAchieved
                      ? t('milestonePassed')
                      : m.projectedDate
                        ? `${t('expectedDate')}: ${m.projectedDate}`
                        : t('pendingRunRate')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PpCard>
  );
}

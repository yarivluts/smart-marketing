'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, Loader2, MousePointerClick, Target, Wallet, Eye } from 'lucide-react';
import type { GrowthPerformanceSummary } from '@growthos/shared';
import { cn } from '@/lib/utils';
import { TrendChart } from '@/components/viz';

type Performance = { status: 'none' } | { status: 'unavailable'; reason: string } | { status: 'ok'; since: string; until: string; summary: GrowthPerformanceSummary };

const PERIODS = [7, 30, 90] as const;

/**
 * How the published ads are doing, straight from Meta: spend, reach, clicks and what they cost, and
 * a day-by-day chart - for the period the person picks. Nothing is shown that Meta did not report.
 */
export function GrowthPerformanceSection({ base, onTargets, metaConnectHref }: { base: string; onTargets?: (byTarget: GrowthPerformanceSummary['byTarget'] | null) => void; metaConnectHref?: string | null }): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.performance');
  const tPublish = useTranslations('GrowthPilot.publish.status');
  const locale = useLocale();
  const [days, setDays] = React.useState<(typeof PERIODS)[number]>(30);
  const [data, setData] = React.useState<Performance | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Any failure - network, a bad answer - reads as "Meta did not return the numbers", never as a crash.
    const load = async (): Promise<Performance> => {
      try {
        const response = await fetch(`${base}/performance?days=${days}`);
        return response.ok ? ((await response.json()) as Performance) : { status: 'unavailable', reason: 'error' };
      } catch {
        return { status: 'unavailable', reason: 'error' };
      }
    };
    void load().then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
        onTargets?.(result.status === 'ok' ? result.summary.byTarget : null);
      });
    return () => {
      cancelled = true;
    };
  }, [base, days, onTargets]);

  if (data?.status === 'none') return null;
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const number = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  const missingMeta = data?.status === 'unavailable' && (data.reason === 'no_meta_credential' || data.reason === 'credential_not_configured');
  const totals = data?.status === 'ok' ? data.summary.totals : null;
  const cards = totals
    ? [
        { key: 'spend', icon: Wallet, value: money.format(totals.spend) },
        { key: 'impressions', icon: Eye, value: number.format(totals.impressions) },
        { key: 'clicks', icon: MousePointerClick, value: number.format(totals.clicks), sub: totals.ctr === null ? null : t('ctr', { value: percent.format(totals.ctr) }) },
        { key: 'cpc', icon: Wallet, value: totals.cpc === null ? '-' : money.format(totals.cpc) },
        { key: 'conversions', icon: Target, value: number.format(totals.conversions), sub: totals.costPerConversion === null ? null : t('costPerConversion', { value: money.format(totals.costPerConversion) }) },
      ]
    : [];

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-performance" data-testid="growth-pilot-performance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="growth-pilot-performance" className="flex items-center gap-2 font-pp-display text-xl font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('title')}
        </h2>
        <div className="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label={t('period')}>
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setDays(period)}
              aria-pressed={days === period}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', days === period ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {t('days', { count: period })}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      ) : data?.status === 'unavailable' ? (
        <p className="rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning" data-testid="growth-pilot-performance-unavailable">
          {t(missingMeta ? 'unavailableMeta' : 'unavailable')}
          {missingMeta && metaConnectHref ? (
            <>
              {' '}
              <a href={metaConnectHref} className="font-semibold underline" data-testid="growth-pilot-performance-connect-meta">
                {tPublish('connect')}
              </a>
            </>
          ) : null}
        </p>
      ) : data?.status === 'ok' ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="growth-pilot-kpis">
            {cards.map((card) => (
              <li key={card.key} className="flex flex-col gap-1 rounded-2xl bg-muted/50 p-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <card.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(`kpi.${card.key}`)}
                </span>
                <span className="font-pp-display text-xl font-bold tabular-nums" data-testid={`growth-pilot-kpi-${card.key}`}>
                  {card.value}
                </span>
                {'sub' in card && card.sub ? <span className="text-[11px] text-muted-foreground">{card.sub}</span> : null}
              </li>
            ))}
          </ul>
          {totals && totals.impressions === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noDelivery')}</p>
          ) : (
            <TrendChart
              label={t('chart')}
              data={data.summary.daily.map((day) => ({ date: day.date.slice(5), clicks: day.clicks, conversions: day.conversions }))}
              xKey="date"
              series={[
                { key: 'clicks', label: t('kpi.clicks') },
                { key: 'conversions', label: t('kpi.conversions') },
              ]}
              kind="line"
              height={220}
            />
          )}
          <p className="text-[11px] text-muted-foreground">{t('source')}</p>
        </>
      ) : null}
    </section>
  );
}

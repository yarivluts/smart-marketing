'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ChevronDown, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface AdUsageMeter {
  key: string;
  label: string;
  used: number;
  limit: number;
  icon: LucideIcon;
}

/** How far into a daily limit: a share for the bar, and whether it is used up. */
export function meterLevel(used: number, limit: number): { percent: number; reached: boolean } {
  if (limit <= 0) return { percent: used > 0 ? 100 : 0, reached: used > 0 };
  return { percent: Math.min(100, Math.round((used / limit) * 100)), reached: used >= limit };
}

/**
 * Slim Pastel Pulse header for an open ad: keeps the breadcrumb, ad title, actions and daily AI
 * limits compact on phones (behind a single pill toggle) and single-row on desktop so the active
 * creation step starts right away.
 */
export function AdHeader({
  studioLabel,
  allAds,
  name,
  objective,
  actions,
  usage,
}: {
  studioLabel: string;
  allAds: { label: string; href: string };
  name: string;
  objective: string;
  actions?: React.ReactNode;
  usage: { label: string; limitReached: string; meters: AdUsageMeter[] };
}): React.ReactElement {
  const tHeader = useTranslations('AdStudio.adHeader');
  const [usageOpen, setUsageOpen] = React.useState(false);
  // Daily limits mean nothing until something has been used: a newcomer's first ad shows no meters.
  const anyUsed = usage.meters.some((meter) => meter.used > 0);
  const anyReached = usage.meters.some((meter) => meterLevel(meter.used, meter.limit).reached);

  return (
    <div className="flex flex-col gap-2" data-testid="ad-studio-ad-header">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <nav
          aria-label={studioLabel}
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span className="hidden shrink-0 sm:inline">{studioLabel}</span>
          <ChevronLeft className="hidden h-3.5 w-3.5 shrink-0 sm:inline ltr:rotate-180" aria-hidden="true" />
          <Link
            href={allAds.href}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pp-surface-container-low px-2.5 py-1 font-medium text-pp-primary transition-colors hover:bg-pp-primary-fixed"
            data-testid="ad-studio-all-ads"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0 sm:hidden ltr:rotate-180" aria-hidden="true" />
            {allAds.label}
          </Link>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 ltr:rotate-180" aria-hidden="true" />
          <span className="truncate font-medium text-foreground" aria-current="page" dir="auto">
            {name}
          </span>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {anyUsed ? (
            <button
              type="button"
              onClick={() => setUsageOpen((current) => !current)}
              aria-expanded={usageOpen}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors md:hidden',
                anyReached
                  ? 'border-warning/50 bg-warning/10 text-warning'
                  : 'border-pp-outline-variant/50 bg-card text-muted-foreground hover:text-foreground',
              )}
              data-testid="ad-studio-usage-toggle"
            >
              <span>{tHeader('toggleUsage')}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', usageOpen && 'rotate-180')} aria-hidden="true" />
            </button>
          ) : null}
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </div>

      <section
        className="flex flex-col gap-2.5 rounded-3xl border border-pp-outline-variant/40 bg-card px-4 py-3.5 shadow-pp-candy sm:px-5 sm:py-4"
        aria-labelledby="ad-studio-ad-name"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1
              id="ad-studio-ad-name"
              className="font-pp-display text-lg font-bold leading-snug tracking-tight sm:text-2xl"
              dir="auto"
            >
              {name}
            </h1>
            {objective ? (
              <p className="line-clamp-1 max-w-2xl text-xs text-muted-foreground sm:line-clamp-2 sm:text-sm" dir="auto">
                {objective}
              </p>
            ) : null}
          </div>

          {anyUsed ? (
            <ul
              className={cn(
                'grid grid-cols-1 gap-1.5 border-t border-border/50 pt-2.5 sm:grid-cols-3 md:flex md:flex-wrap md:items-center md:border-t-0 md:pt-0',
                !usageOpen && 'max-md:hidden',
              )}
              aria-label={usage.label}
              data-testid="ad-studio-usage-meters"
            >
              {usage.meters.map((meter) => {
                const { percent, reached } = meterLevel(meter.used, meter.limit);
                const Icon = reached ? AlertTriangle : meter.icon;
                return (
                  <li
                    key={meter.key}
                    className={cn(
                      'flex flex-col gap-1 rounded-2xl border px-3 py-1.5 md:rounded-full md:py-1',
                      reached
                        ? 'border-warning/40 bg-warning/10'
                        : 'border-pp-outline-variant/40 bg-pp-surface-container-low/80',
                    )}
                    data-testid={`ad-studio-usage-${meter.key}`}
                    data-reached={reached || undefined}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            reached ? 'text-warning' : 'text-pp-primary',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{meter.label}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {reached ? (
                          <span className="rounded-full border border-warning/50 bg-card px-1.5 py-px text-[10px] font-semibold text-warning">
                            {usage.limitReached}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            reached ? 'text-warning' : 'text-foreground',
                          )}
                          dir="ltr"
                        >
                          {meter.used}/{meter.limit}
                        </span>
                      </span>
                    </span>
                    <span
                      className="h-1 overflow-hidden rounded-full bg-border/70 md:hidden"
                      aria-hidden="true"
                    >
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          reached ? 'bg-warning' : 'bg-pp-primary',
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

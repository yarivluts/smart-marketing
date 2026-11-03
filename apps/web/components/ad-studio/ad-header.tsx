import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
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
 * The top of an open ad: where it sits (studio › all ads › this ad), its name and objective, its own
 * actions, and today's AI usage as one slim row of meters - the studio-wide figure cards stay on the
 * list of ads, so every step of the ad starts with the ad itself.
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
  // Daily limits mean nothing until something has been used: a newcomer's first ad shows no meters.
  const anyUsed = usage.meters.some((meter) => meter.used > 0);
  return (
    <div className="flex flex-col gap-3" data-testid="ad-studio-ad-header">
      <nav
        aria-label={studioLabel}
        className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span className="shrink-0">{studioLabel}</span>
        <ChevronLeft className="h-3.5 w-3.5 shrink-0 ltr:rotate-180" aria-hidden="true" />
        <Link
          href={allAds.href}
          className="shrink-0 font-medium text-primary hover:underline"
          data-testid="ad-studio-all-ads"
        >
          {allAds.label}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 shrink-0 ltr:rotate-180" aria-hidden="true" />
        <span className="truncate font-medium text-foreground" aria-current="page" dir="auto">
          {name}
        </span>
      </nav>
      <section
        className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-6"
        aria-labelledby="ad-studio-ad-name"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1
              id="ad-studio-ad-name"
              className="font-pp-display text-2xl font-bold tracking-tight [text-wrap:balance] sm:text-3xl"
              dir="auto"
            >
              {name}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground" dir="auto">
              {objective}
            </p>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {anyUsed ? (
          <ul
            className="grid grid-cols-1 gap-2 border-t border-border/60 pt-4 sm:grid-cols-3"
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
                    'flex flex-col gap-1.5 rounded-2xl border px-3 py-2',
                    reached ? 'border-warning/40 bg-warning/10' : 'border-border/60 bg-muted/40',
                  )}
                  data-testid={`ad-studio-usage-${meter.key}`}
                  data-reached={reached || undefined}
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <Icon
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          reached ? 'text-warning' : 'text-primary',
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
                    className="h-1 overflow-hidden rounded-full bg-border/70"
                    aria-hidden="true"
                  >
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        reached ? 'bg-warning' : 'bg-primary',
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

import type * as React from 'react';
import { useTranslations } from 'next-intl';
import { Clock, FileText, Film, ImageIcon, Sparkles, type LucideIcon } from 'lucide-react';
import { limitUsedPercent } from '@/lib/ad-studio/view';
import { cn } from '@/lib/utils';

export interface StudioStatsProps {
  overview: { briefs: number; scripted: number; scriptedSeconds: number };
  usageToday: { textGenerations: number; videoSeconds: number; images: number };
  limits: { text: number; video: number; images: number };
}

interface StatItem {
  key: string;
  title: string;
  value: number;
  icon: LucideIcon;
  subtext?: string;
  progress?: number;
  highlight?: boolean;
}

function progressTone(percent: number): string {
  if (percent >= 100) return 'bg-destructive';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-pp-primary';
}

/**
 * The figure strip on the list of ads. Before the first ad exists every card would read 0 beside a
 * daily limit the person has never heard of, so a newcomer sees none of them until there is an ad.
 * On mobile it renders as a compact swipeable pill tray so existing ads stay above the fold.
 */
export function StudioStats({ overview, usageToday, limits }: StudioStatsProps): React.ReactElement | null {
  const t = useTranslations('AdStudio');
  if (overview.briefs === 0) return null;

  const items: StatItem[] = [
    {
      key: 'ads',
      title: t('kpiAds'),
      value: overview.briefs,
      icon: FileText,
    },
    {
      key: 'scripted',
      title: t('kpiScripted'),
      value: overview.scripted,
      icon: Film,
      subtext: t('kpiScriptedHint', { seconds: overview.scriptedSeconds }),
      highlight: overview.scripted > 0,
    },
    {
      key: 'text',
      title: t('kpiTextToday'),
      value: usageToday.textGenerations,
      icon: Sparkles,
      subtext: t('kpiOfLimit', { limit: limits.text }),
      progress: limitUsedPercent(usageToday.textGenerations, limits.text),
    },
    {
      key: 'video',
      title: t('kpiVideoToday'),
      value: usageToday.videoSeconds,
      icon: Clock,
      subtext: t('kpiOfLimit', { limit: limits.video }),
      progress: limitUsedPercent(usageToday.videoSeconds, limits.video),
    },
    {
      key: 'images',
      title: t('usageTodayImages'),
      value: usageToday.images,
      icon: ImageIcon,
      subtext: t('kpiOfLimit', { limit: limits.images }),
      progress: limitUsedPercent(usageToday.images, limits.images),
    },
  ];

  return (
    <div
      className="flex min-w-0 max-w-full gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible"
      data-testid="ad-studio-stats"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const clamped = item.progress !== undefined ? Math.min(Math.max(item.progress, 0), 100) : undefined;
        return (
          <div
            key={item.key}
            className={cn(
              'flex w-[156px] shrink-0 flex-col justify-between rounded-2xl border p-3.5 shadow-sm sm:w-[172px] lg:w-auto',
              item.highlight
                ? 'border-pp-primary/25 bg-gradient-to-bl from-card to-pp-surface-container-low'
                : 'border-pp-outline-variant/40 bg-card/95',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 line-clamp-2 text-xs font-medium leading-tight text-muted-foreground">
                {item.title}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
                  item.highlight ? 'bg-emerald-50 text-emerald-700' : 'bg-pp-primary-fixed text-pp-primary',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2">
              <p className="font-pp-display text-2xl font-bold leading-none tabular-nums text-foreground">
                <span dir="ltr">{item.value}</span>
              </p>
              {clamped !== undefined ? (
                <div
                  role="progressbar"
                  aria-label={item.title}
                  aria-valuenow={clamped}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pp-surface-container"
                >
                  <div
                    className={cn('h-full rounded-full transition-all duration-300', progressTone(clamped))}
                    style={{ width: `${clamped}%` }}
                  />
                </div>
              ) : null}
              {item.subtext ? (
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{item.subtext}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

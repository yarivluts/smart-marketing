'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface EventVolumeSparklineProps {
  dailyCounts: readonly { date: string; count: number }[];
  className?: string;
}

/**
 * A minimal inline volume sparkline (KAN-36) — one bar per day in the
 * window, height proportional to that day's count. Plain divs, so it stays a
 * few bytes per row even when the registry lists dozens of event schemas.
 */
export function EventVolumeSparkline({ dailyCounts, className }: EventVolumeSparklineProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const maxCount = Math.max(1, ...dailyCounts.map((bucket) => bucket.count));

  return (
    <div
      className={cn('flex h-8 items-end gap-0.5', className)}
      role="img"
      aria-label={t('eventVolumeSparklineLabel', { total: dailyCounts.reduce((sum, bucket) => sum + bucket.count, 0) })}
      data-testid="event-volume-sparkline"
    >
      {dailyCounts.map((bucket) => (
        <div
          key={bucket.date}
          title={t('eventVolumeSparklineBarTitle', { date: bucket.date, count: bucket.count })}
          className={cn('min-w-[6px] flex-1 rounded-sm', bucket.count > 0 ? 'bg-primary' : 'bg-muted')}
          style={{ height: `${Math.max(4, Math.round((bucket.count / maxCount) * 100))}%` }}
        />
      ))}
    </div>
  );
}

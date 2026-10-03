'use client';

import { useTranslations } from 'next-intl';

export interface EventVolumeSparklineProps {
  dailyCounts: readonly { date: string; count: number }[];
}

/**
 * A minimal inline volume sparkline (KAN-36) — one bar per day in the
 * window, height proportional to that day's count.
 */
export function EventVolumeSparkline({ dailyCounts }: EventVolumeSparklineProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const maxCount = Math.max(1, ...dailyCounts.map((bucket) => bucket.count));

  return (
    <div
      className="flex h-8 items-end gap-1"
      role="img"
      aria-label={t('eventVolumeSparklineLabel', { total: dailyCounts.reduce((sum, bucket) => sum + bucket.count, 0) })}
    >
      {dailyCounts.map((bucket) => (
        <div
          key={bucket.date}
          title={t('eventVolumeSparklineBarTitle', { date: bucket.date, count: bucket.count })}
          className={bucket.count > 0 ? 'w-2 rounded-t-sm bg-pp-primary' : 'w-2 rounded-t-sm bg-pp-surface-container'}
          style={{ height: `${Math.max(4, Math.round((bucket.count / maxCount) * 100))}%` }}
        />
      ))}
    </div>
  );
}

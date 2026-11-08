'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';

/** The newest changes to the platform's suggestion defaults, newest first: when, and how many values were set. */
export function ThresholdsHistory({ history }: { history: { by: string; on: string; after: Record<string, unknown> | null }[] }): React.ReactElement {
  const t = useTranslations('GrowthPilot.settings');
  const when = useLocalDateTime({ dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-thresholds-history">
      <h2 id="growth-pilot-thresholds-history" className="font-pp-display text-base font-semibold">
        {t('history')}
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm" data-testid="growth-pilot-thresholds-history">
          {history.map((entry) => (
            <li key={`${entry.on}-${entry.by}`} className="flex flex-wrap gap-x-2">
              <span>{t('historyEntry', { date: when(entry.on), count: Object.keys(entry.after ?? {}).length })}</span>
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                {entry.by}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import type { RepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';

export interface RepCollectionLeaderboardWidgetProps {
  view: RepCollectionLeaderboardView;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

/**
 * This week's rep-attributed collections leaderboard (KAN-88, E20.x, plan
 * `14 §Gap 13`'s "war-room integration") — a headline card on the win-rules
 * ("war-room") page, the same established precedent KAN-66's
 * `TrialPipelineWidget` set for adding a new headline box there rather than
 * the full `/tv` fullscreen rotation (a much larger, separately-scoped
 * integration — see this story's own PROGRESS.md entry). Degrades to a
 * translated empty state when nothing has been logged yet this week, the
 * same posture `TrialPipelineWidget` takes for "nothing to show" rather than
 * rendering a blank card.
 */
export function RepCollectionLeaderboardWidget({ view }: RepCollectionLeaderboardWidgetProps): React.ReactElement {
  const t = useTranslations('RepCollectionLeaderboard');

  if (view.rows.length === 0 && view.unattributedCount === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
        <h2 className="text-lg font-semibold">{t('heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
      <h2 className="text-lg font-semibold">{t('heading')}</h2>
      {view.rows.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {view.rows.slice(0, 5).map((row, index) => (
            <li key={row.orgPersonId} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">{t('rank', { rank: index + 1, name: row.name })}</span>
              <span className="tabular-nums text-muted-foreground">{t('rowSummary', { amount: formatAmount(row.totalAmount), count: row.entryCount })}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {view.unattributedCount > 0 ? (
        <p className="text-xs text-muted-foreground">{t('unattributed', { amount: formatAmount(view.unattributedTotal), count: view.unattributedCount })}</p>
      ) : null}
    </section>
  );
}

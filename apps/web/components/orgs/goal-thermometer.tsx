'use client';

import { useTranslations } from 'next-intl';
import type { GoalThermometerView } from '@/lib/orgs/goal-view';

export interface GoalThermometerProps {
  view: GoalThermometerView;
}

const STATUS_BADGE_CLASSES: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
};

const STATUS_BAR_CLASSES: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/**
 * A goal's pace thermometer (KAN-64, E12.1's own AC: "Goal thermometer
 * renders with pace status; minimize-goal (signup cost) shows correct
 * red/green"): a simple CSS width-percentage bar plus a colored status
 * badge — no charting library, the same convention every other tile
 * renderer in this codebase (`BoardTileView`) already follows. Renders the
 * goal's own degraded-outcome message when `view.kind !== 'ok'`, mirroring
 * `BoardTileView`'s `UnavailableView`.
 */
export function GoalThermometer({ view }: GoalThermometerProps): React.ReactElement {
  const t = useTranslations('Goals');

  if (view.kind !== 'ok') {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input p-4 text-center">
        <span className="text-xs font-medium text-muted-foreground">{t(`thermometerUnavailableReason.${view.kind}`)}</span>
        {'message' in view ? <span className="text-xs text-muted-foreground">{view.message}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          role="status"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[view.statusColor]}`}
        >
          {t(`paceStatus.${view.status}`)}
        </span>
        <span className="text-xs text-muted-foreground">{t('goalMetLabel', { met: view.isGoalMet ? t('yes') : t('no') })}</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(view.percentFilled)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-6 w-full overflow-hidden rounded-md bg-muted"
      >
        <div
          className={`h-6 rounded-md transition-[width] ${STATUS_BAR_CLASSES[view.statusColor]}`}
          style={{ width: `${view.percentFilled}%` }}
        />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t('actualValueLabel')}</dt>
          <dd className="font-medium tabular-nums">{formatNumber(view.actualValue)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t('expectedAtNowLabel')}</dt>
          <dd className="font-medium tabular-nums">{formatNumber(view.expectedAtNow)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t('projectedFinalValueLabel')}</dt>
          <dd className="font-medium tabular-nums">{formatNumber(view.projectedFinalValue)}</dd>
        </div>
      </dl>
    </div>
  );
}

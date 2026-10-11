import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, HandCoins, Percent, RotateCw, Wallet } from 'lucide-react';
import type { BillingRecoverySummary } from '@growthos/firebase-orm-models';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState } from '@/components/viz';
import { formatStripeAmount, formatStripeAmountsByCurrency, recoveryDurationParts } from '@/lib/orgs/billing-recovery-view';

/** How many recovered payments the list shows; the KPIs above it always cover every recovery found. */
export const RECOVERED_PAYMENTS_LIST_LIMIT = 20;

export interface RecoveredPaymentsSectionProps {
  summary: BillingRecoverySummary;
}

/**
 * The billing-ops page's "recovered payments" section (KAN-304): failed Stripe payments that the same
 * customer later paid inside the dunning window. Renders an empty state - not a row of zeros - until a
 * failed payment has landed, and shows a KPI as unavailable rather than 0 when the figure has no
 * denominator yet (no failed attempt's window has closed, nothing recovered).
 */
export function RecoveredPaymentsSection({ summary }: RecoveredPaymentsSectionProps): React.ReactElement {
  const t = useTranslations('BillingOpsFeed');
  const locale = useLocale();
  const integer = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const formatDate = (iso: string): string => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : dateTime.format(parsed);
  };
  const formatDuration = (hours: number): string => {
    const parts = recoveryDurationParts(hours);
    return parts.unit === 'hours' ? t('recoveryDurationHours', { hours: parts.value }) : t('recoveryDurationDays', { days: parts.value });
  };

  const { failedAttempts, recoveries } = summary;
  const settled = failedAttempts.recovered + failedAttempts.unrecovered;
  const anyFailure = settled + failedAttempts.pending + failedAttempts.unpairable > 0;
  const description =
    summary.failedPaymentsTruncated || summary.chargesTruncated
      ? t('recoveryDescriptionTruncated', { days: summary.windowDays, failed: summary.failedPaymentsScanned, charges: summary.chargesScanned })
      : t('recoveryDescription', { days: summary.windowDays });
  const footer = t('recoveryWindowNote', { days: summary.windowDays });

  if (!anyFailure) {
    return (
      <ChartCard title={t('recoveryHeading')} description={description} icon={RotateCw} footer={footer}>
        <EmptyState compact icon={RotateCw} title={t('recoveryEmpty')} description={t('recoveryEmptyHint')} />
      </ChartCard>
    );
  }

  const shown = recoveries.slice(0, RECOVERED_PAYMENTS_LIST_LIMIT);
  const notes = [
    ...(failedAttempts.pending > 0 ? [t('recoveryPendingLine', { count: failedAttempts.pending })] : []),
    ...(failedAttempts.unpairable > 0 ? [t('recoveryUnpairableLine', { count: failedAttempts.unpairable })] : []),
  ];

  return (
    <ChartCard title={t('recoveryHeading')} description={description} icon={RotateCw} footer={footer}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('recoveryKpiPayments')}
            value={integer.format(recoveries.length)}
            icon={HandCoins}
            subtext={t('recoveryKpiPaymentsSub', { count: failedAttempts.recovered })}
          />
          <StatCard
            title={t('recoveryKpiAmount')}
            value={recoveries.length > 0 ? formatStripeAmountsByCurrency(summary.recoveredByCurrency, locale) : t('recoveryNotAvailable')}
            icon={Wallet}
            subtext={recoveries.length > 0 ? t('recoveryKpiAmountSub') : t('recoveryKpiAmountNone')}
          />
          <StatCard
            title={t('recoveryKpiRate')}
            value={summary.recoveryRate === null ? t('recoveryNotAvailable') : percent.format(summary.recoveryRate)}
            icon={Percent}
            subtext={
              summary.recoveryRate === null
                ? t('recoveryKpiRatePending')
                : t('recoveryKpiRateSub', { recovered: failedAttempts.recovered, settled })
            }
          />
          <StatCard
            title={t('recoveryKpiTime')}
            value={summary.medianHoursToRecover === null ? t('recoveryNotAvailable') : formatDuration(summary.medianHoursToRecover)}
            icon={Clock}
            subtext={summary.medianHoursToRecover === null ? t('recoveryKpiTimeNone') : t('recoveryKpiTimeSub')}
          />
        </div>

        {notes.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState compact icon={HandCoins} title={t('recoveryNoneYet')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('recoveryHeading')}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">{t('recoveryColumnCustomer')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('recoveryColumnAmount')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('recoveryColumnAttempts')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('recoveryColumnFailedAt')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('recoveryColumnRecoveredAt')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('recoveryColumnTime')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((recovery) => (
                  <tr key={recovery.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pe-3 font-mono text-xs" dir="ltr">
                      {recovery.customerId}
                    </td>
                    <td className="py-2 pe-3 text-end font-semibold tabular-nums" dir="ltr">
                      {formatStripeAmount(recovery.amountMinorUnits, recovery.currency, locale)}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">{integer.format(recovery.failedAttempts)}</td>
                    <td className="py-2 pe-3">{formatDate(recovery.firstFailedAt)}</td>
                    <td className="py-2 pe-3">{formatDate(recovery.recoveredAt)}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">{formatDuration(recovery.hoursToRecover)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recoveries.length > shown.length ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('recoveryListCap', { shown: shown.length, total: recoveries.length })}</p>
            ) : null}
          </div>
        )}
      </div>
    </ChartCard>
  );
}

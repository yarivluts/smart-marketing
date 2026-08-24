'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Users, Smartphone, Monitor, Tablet, PieChart } from 'lucide-react';
import type { AudienceSegmentItem, DeviceBreakdownItem } from './types';

export interface AudienceSegmentationCardProps {
  segments: AudienceSegmentItem[];
  devices: DeviceBreakdownItem[];
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNum(val: number): string {
  return new Intl.NumberFormat(undefined).format(val);
}

export function AudienceSegmentationCard({ segments, devices }: AudienceSegmentationCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const deviceIcons = {
    mobile: Smartphone,
    desktop: Monitor,
    tablet: Tablet,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Audience Segments (2 cols) */}
      <Card className="flex flex-col justify-between gap-5 p-6 bg-card border-border shadow-sm lg:col-span-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-500/10 p-1.5 text-indigo-600 dark:text-indigo-400">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('audienceSegmentsTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('audienceSegmentsSubtitle')}</p>
        </div>

        <div className="flex flex-col divide-y divide-border/60">
          {segments.map((seg) => (
            <div key={seg.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">{t(seg.nameKey)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {`${formatNum(seg.visitors)} ${t('visitorsLabel')} • ${formatNum(seg.conversions)} ${t('conversionsLabel')}`}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="flex flex-col items-end">
                  <span className="text-[11px] text-muted-foreground">{t('conversionRate')}</span>
                  <span className="font-bold text-foreground">{`${seg.conversionRatePct}%`}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] text-muted-foreground">{t('metricRevenue')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(seg.revenue)}</span>
                </div>
                <div className="flex flex-col items-end min-w-[48px]">
                  <span className="text-[11px] text-muted-foreground">{t('metricRoas')}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-bold text-foreground">{`${seg.roas}x`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Device Breakdown (1 col) */}
      <Card className="flex flex-col justify-between gap-5 p-6 bg-card border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-teal-500/10 p-1.5 text-teal-600 dark:text-teal-400">
              <PieChart className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('deviceBreakdownTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('deviceBreakdownSubtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          {devices.map((dev) => {
            const Icon = deviceIcons[dev.device] ?? Smartphone;
            return (
              <div key={dev.device} className="flex flex-col gap-1.5 rounded-xl border border-border/70 p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-bold text-foreground">{t(`device_${dev.device}`)}</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{`${dev.trafficSharePct}% ${t('trafficLabel')}`}</span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${dev.trafficSharePct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                  <span>{`${t('conversionRate')}: `}<strong className="text-foreground">{`${dev.conversionRatePct}%`}</strong></span>
                  <span>{formatCurrency(dev.revenue)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { DollarSign, TrendingUp, Target, Users, Zap, ShieldCheck } from 'lucide-react';
import type { GrowthKpiSummary } from './types';

export interface KpiRibbonProps {
  kpis: GrowthKpiSummary;
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

export function KpiRibbon({ kpis }: KpiRibbonProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const cards = [
    {
      id: 'spend',
      title: t('kpiSpend'),
      value: formatCurrency(kpis.totalSpend),
      delta: `+${kpis.spendDeltaPct}%`,
      deltaPositive: false,
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      id: 'revenue',
      title: t('kpiRevenue'),
      value: formatCurrency(kpis.totalRevenue),
      delta: `+${kpis.revenueDeltaPct}%`,
      deltaPositive: true,
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      id: 'roas',
      title: t('kpiRoas'),
      value: `${kpis.blendedRoas}x`,
      badge: t('kpiRoasRatingHigh'),
      delta: '+0.6x',
      deltaPositive: true,
      icon: Zap,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      id: 'conversions',
      title: t('kpiConversions'),
      value: formatNum(kpis.totalConversions),
      delta: `+${kpis.conversionsDeltaPct}%`,
      deltaPositive: true,
      icon: Target,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
    {
      id: 'cac',
      title: t('kpiCac'),
      value: formatCurrency(kpis.blendedCac),
      delta: `${kpis.cacDeltaPct}%`,
      deltaPositive: true,
      icon: Users,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
    {
      id: 'profit',
      title: t('kpiNetProfit'),
      value: formatCurrency(kpis.netProfit),
      delta: '+34.2%',
      deltaPositive: true,
      icon: ShieldCheck,
      color: 'text-teal-500',
      bg: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.id}
            className="flex flex-col justify-between p-4 bg-card border-border hover:border-primary/40 transition-colors shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{c.title}</span>
              <div className={`rounded-lg p-1.5 ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <span className="text-xl font-bold tracking-tight text-foreground">{c.value}</span>
              <div className="flex items-center gap-1.5 text-xs">
                <span className={c.deltaPositive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                  {c.delta}
                </span>
                {c.badge ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {c.badge}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

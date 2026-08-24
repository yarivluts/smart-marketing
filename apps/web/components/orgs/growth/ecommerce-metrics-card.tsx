'use client';

import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  TrendingUp,
  ShoppingCart,
  RotateCcw,
  Sparkles,
  Package,
  ArrowUpRight,
} from 'lucide-react';
import type { EcommerceGrowthMetrics } from './types';

interface EcommerceMetricsCardProps {
  metrics: EcommerceGrowthMetrics;
  isDemo?: boolean;
}

export function EcommerceMetricsCard({ metrics }: EcommerceMetricsCardProps) {
  const t = useTranslations('GrowthDashboard');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {t('ecommerceTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('ecommerceSubtitle')}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
          <span>{t('ecommerceEngineActive')}</span>
        </div>
      </div>

      {/* One-Time & E-Commerce KPIs Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* GMV */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('metricGmv')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.grossMerchandiseValue)}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {metrics.totalOrders.toLocaleString()} {t('ordersCountLabel')}
          </span>
        </div>

        {/* AOV */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            <span>{t('metricAov')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.averageOrderValue)}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <ArrowUpRight className="h-3 w-3" />
            <span>{'+'}{metrics.aovDeltaPct}{'% YoY'}</span>
          </div>
        </div>

        {/* Cart Abandonment Rate */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShoppingCart className="h-3.5 w-3.5 text-amber-500" />
            <span>{t('metricCartAbandonment')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {metrics.cartAbandonmentRatePct}{'%'}
          </div>
          <span className="text-[11px] text-muted-foreground">{t('industryAvgBench')}</span>
        </div>

        {/* Recovered Revenue */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('metricRecoveredRevenue')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.cartRecoveryRevenue)}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t('viaAutomatedFlows')}
          </span>
        </div>

        {/* Repeat Purchase Rate */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 text-purple-500" />
            <span>{t('metricRepeatPurchaseRate')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {metrics.repeatPurchaseRatePct}{'%'}
          </div>
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            {t('highLoyaltyBench')}
          </span>
        </div>
      </div>

      {/* Top Performing SKUs / Bundles */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="flex items-center justify-between text-xs font-bold text-foreground">
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-emerald-500" />
            <span>{t('topSellingProductsHeading')}</span>
          </div>
          <span className="text-muted-foreground">{t('rankedByRevenue')}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {metrics.topSellingProducts.map((product, idx) => (
            <div
              key={product.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {'#'}{idx + 1} {t(product.nameKey as Parameters<typeof t>[0])}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {product.conversionRatePct}{'% CVR'}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">
                  {product.unitsSold.toLocaleString()} {t('unitsSoldLabel')}
                </span>
                <span className="font-bold text-foreground">
                  {formatCurrency(product.revenue)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  DollarSign,
  Percent,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

export type VerticalPreset = 'b2b_saas' | 'ecommerce' | 'agency';

export function GrowthRoiCalculator(): React.ReactElement {
  const t = useTranslations('HomePage');

  // Input states
  const [adSpend, setAdSpend] = useState<number>(35000);
  const [visitors, setVisitors] = useState<number>(60000);
  const [conversionRate, setConversionRate] = useState<number>(2.2);
  const [orderValue, setOrderValue] = useState<number>(350);
  const [activePreset, setActivePreset] = useState<VerticalPreset>('b2b_saas');

  const applyPreset = (preset: VerticalPreset) => {
    setActivePreset(preset);
    if (preset === 'b2b_saas') {
      setAdSpend(40000);
      setVisitors(50000);
      setConversionRate(2.4);
      setOrderValue(1200);
    } else if (preset === 'ecommerce') {
      setAdSpend(75000);
      setVisitors(250000);
      setConversionRate(1.8);
      setOrderValue(110);
    } else if (preset === 'agency') {
      setAdSpend(120000);
      setVisitors(400000);
      setConversionRate(2.8);
      setOrderValue(450);
    }
  };

  // Calculations
  const currentMonthlyConversions = Math.round(visitors * (conversionRate / 100));

  // GrowthOS impact multipliers
  // 1. Recovered wasted spend (fatigue kill-switch + fraud protection ~18%)
  const wastedSpendSavedMonthly = Math.round(adSpend * 0.18);
  const annualSavedSpend = wastedSpendSavedMonthly * 12;

  // 2. Conversion lift via Prompt-to-DOM edge personalization (~21% lift)
  const incrementalConversions = Math.round(currentMonthlyConversions * 0.21);
  const incrementalRevenueMonthly = incrementalConversions * orderValue;
  const annualIncrementalRevenue = incrementalRevenueMonthly * 12;

  // 3. Net total annual value
  const totalAnnualValueCreated = annualSavedSpend + annualIncrementalRevenue;

  // 4. ROI multiplier based on average GrowthOS tier (~$3,500/year)
  const estimatedPlatformCostAnnual = 3588;
  const roiMultiplier = Math.max(1, (totalAnnualValueCreated / estimatedPlatformCostAnnual)).toFixed(1);

  return (
    <section id="calculator" className="py-20 md:py-28 bg-muted/20 border-t border-border/40 relative" data-testid="growth-roi-calculator">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <Badge variant="purple" size="sm" className="mb-3">
            <Calculator className="h-3.5 w-3.5 me-1" />
            <span>{t('calcBadge')}</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {t('calcHeading')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base">
            {t('calcSubheading')}
          </p>

          {/* Presets */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground me-1 font-medium">{t('calcPresets')}:</span>
            {[
              { id: 'b2b_saas', label: t('calcPresetB2B') },
              { id: 'ecommerce', label: t('calcPresetEcom') },
              { id: 'agency', label: t('calcPresetAgency') },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id as VerticalPreset)}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                  activePreset === p.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Interactive Inputs (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-soft space-y-6">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span>{t('calcInputsTitle')}</span>
            </h3>

            {/* Slider 1: Monthly Ad Spend */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="input-ad-spend" className="font-semibold text-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('calcMonthlyAdSpend')}</span>
                </label>
                <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                  ${adSpend.toLocaleString()} / mo
                </span>
              </div>
              <input
                id="input-ad-spend"
                type="range"
                min={5000}
                max={250000}
                step={2500}
                value={adSpend}
                onChange={(e) => {
                  setAdSpend(Number(e.target.value));
                  setActivePreset('b2b_saas');
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>$5k</span>
                <span>$100k</span>
                <span>$250k+</span>
              </div>
            </div>

            {/* Slider 2: Monthly Visitors */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="input-visitors" className="font-semibold text-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('calcMonthlyVisitors')}</span>
                </label>
                <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                  {visitors.toLocaleString()} visitors
                </span>
              </div>
              <input
                id="input-visitors"
                type="range"
                min={10000}
                max={1000000}
                step={10000}
                value={visitors}
                onChange={(e) => {
                  setVisitors(Number(e.target.value));
                  setActivePreset('b2b_saas');
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>10k</span>
                <span>500k</span>
                <span>1M+</span>
              </div>
            </div>

            {/* Slider 3: Conversion Rate */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="input-cr" className="font-semibold text-foreground flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('calcConversionRate')}</span>
                </label>
                <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                  {conversionRate.toFixed(1)}%
                </span>
              </div>
              <input
                id="input-cr"
                type="range"
                min={0.5}
                max={8.0}
                step={0.1}
                value={conversionRate}
                onChange={(e) => {
                  setConversionRate(Number(e.target.value));
                  setActivePreset('b2b_saas');
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>0.5%</span>
                <span>4.0%</span>
                <span>8.0%</span>
              </div>
            </div>

            {/* Slider 4: Order Value / ACV */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="input-aov" className="font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('calcOrderValue')}</span>
                </label>
                <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                  ${orderValue.toLocaleString()}
                </span>
              </div>
              <input
                id="input-aov"
                type="range"
                min={30}
                max={3000}
                step={20}
                value={orderValue}
                onChange={(e) => {
                  setOrderValue(Number(e.target.value));
                  setActivePreset('b2b_saas');
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>$30</span>
                <span>$1,500</span>
                <span>$3,000</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Projected Impact (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-soft-xl space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                  {t('calcProjectedAnnualGain')}
                </span>
                <Badge variant="emerald" size="sm" className="font-bold">
                  {roiMultiplier}x Net ROI
                </Badge>
              </div>

              {/* Big Dollar Value */}
              <div className="mt-4">
                <div className="text-4xl sm:text-5xl font-black text-foreground tracking-tight" dir="ltr">
                  +${totalAnnualValueCreated.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('calcAnnualValueDesc')}
                </p>
              </div>

              {/* Breakdown Rows */}
              <div className="mt-8 space-y-4 divide-y divide-border/60">
                <div className="pt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">{t('calcSavedWastedSpend')}</div>
                      <div className="text-[11px] text-muted-foreground">{t('calcSavedWastedSpendDesc')}</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm" dir="ltr">
                    +${annualSavedSpend.toLocaleString()}
                  </span>
                </div>

                <div className="pt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">{t('calcConversionLiftRevenue')}</div>
                      <div className="text-[11px] text-muted-foreground">{t('calcConversionLiftDesc')}</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                    +${annualIncrementalRevenue.toLocaleString()}
                  </span>
                </div>

                <div className="pt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">{t('calcEstimatedPayback')}</div>
                      <div className="text-[11px] text-muted-foreground">{t('calcEstimatedPaybackDesc')}</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-foreground text-sm" dir="ltr">
                    &lt; 14 Days
                  </span>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <Button asChild size="lg" className="w-full bg-brand-gradient text-white shadow-soft-md hover:opacity-95 text-xs font-bold h-11">
              <Link href="/dashboard" className="flex items-center justify-center gap-2">
                <span>{t('calcUnlockRoiBtn')}</span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

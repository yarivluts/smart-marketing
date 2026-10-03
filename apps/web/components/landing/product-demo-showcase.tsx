'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Megaphone,
  Pause,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

interface CampaignDemoRow {
  id: string;
  name: string;
  platform: 'google' | 'meta';
  spend: string;
  conversions: number;
  cpa: string;
  status: 'active' | 'paused';
  fatiguePct: number;
  color: string;
}

const INITIAL_CAMPAIGNS: CampaignDemoRow[] = [
  {
    id: 'c-1',
    name: 'US-Search-High-Intent-SaaS',
    platform: 'google',
    spend: '$24,800',
    conversions: 312,
    cpa: '$79.48',
    status: 'active',
    fatiguePct: 92,
    color: 'bg-blue-500',
  },
  {
    id: 'c-2',
    name: 'Meta-Retargeting-Lookalike-Q3',
    platform: 'meta',
    spend: '$18,450',
    conversions: 245,
    cpa: '$75.30',
    status: 'active',
    fatiguePct: 68,
    color: 'bg-indigo-500',
  },
  {
    id: 'c-3',
    name: 'Google-PMax-Creative-Scale',
    platform: 'google',
    spend: '$9,200',
    conversions: 184,
    cpa: '$50.00',
    status: 'paused',
    fatiguePct: 44,
    color: 'bg-rose-500',
  },
];

export function ProductDemoShowcase(): React.ReactElement {
  const t = useTranslations('HomePage');
  const [activeTab, setActiveTab] = useState<'pulse' | 'ads' | 'cohorts' | 'funnel'>('pulse');

  // Pulse interactive state
  const [pulseWindow, setPulseWindow] = useState<'today' | '7d' | '30d'>('30d');
  const [anomalyResolved, setAnomalyResolved] = useState<boolean>(false);

  // Ads interactive state
  const [adsPlatformFilter, setAdsPlatformFilter] = useState<'all' | 'google' | 'meta'>('all');
  const [campaigns, setCampaigns] = useState<CampaignDemoRow[]>(INITIAL_CAMPAIGNS);

  // Cohorts interactive state
  const [cohortMetric, setCohortMetric] = useState<'payback' | 'retention' | 'ltv'>('payback');

  // Funnel interactive state
  const [activeFunnelStep, setActiveFunnelStep] = useState<number>(2);

  const toggleCampaignStatus = (id: string) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } : c,
      ),
    );
  };

  const filteredCampaigns =
    adsPlatformFilter === 'all'
      ? campaigns
      : campaigns.filter((c) => c.platform === adsPlatformFilter);

  return (
    <section id="demo" className="py-16 md:py-24 bg-muted/30 border-y border-border/40" data-testid="product-demo-showcase">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <Badge variant="purple" size="sm" className="mb-3">
            {t('demoLivePipeline')}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t('demoTitle')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base">
            {t('demoSubtitle')}
          </p>

          {/* Tab Selector Buttons */}
          <div className="mt-8 inline-flex flex-wrap items-center justify-center rounded-xl bg-card border border-border/80 p-1.5 shadow-soft">
            <button
              type="button"
              onClick={() => setActiveTab('pulse')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'pulse'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>{t('demoTabPulse')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ads')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'ads'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              <span>{t('demoTabAds')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cohorts')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'cohorts'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>{t('demoTabCohorts')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('funnel')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'funnel'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>{t('demoTabFunnel')}</span>
            </button>
          </div>
        </div>

        {/* Interactive Showcase Window */}
        <div className="rounded-2xl border border-border/80 bg-card/90 shadow-soft-xl overflow-hidden backdrop-blur-xl">
          {/* Top Window Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-3.5 gap-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ms-3 text-xs font-mono text-muted-foreground">{t('demoEngineSession')}</span>
            </div>
            <Badge variant="emerald" dot size="sm">
              <span>{t('demoLivePipeline')}</span>
            </Badge>
          </div>

          {/* Window Body Content */}
          <div className="p-6 sm:p-8">
            {/* TAB 1: EXECUTIVE PULSE */}
            {activeTab === 'pulse' && (
              <div className="space-y-6 animate-fade-in">
                {/* Time Range Selector & AI Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border text-xs">
                    {(['today', '7d', '30d'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setPulseWindow(w)}
                        className={`rounded-md px-3 py-1 font-semibold transition-all ${
                          pulseWindow === w
                            ? 'bg-card text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {w === 'today' ? 'Today' : w === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                      </button>
                    ))}
                  </div>

                  {/* Interactive Copilot Anomaly Alert */}
                  <div className="flex items-center gap-2">
                    {!anomalyResolved ? (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-600 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>High CPA surge detected on Meta adset</span>
                        <Button
                          size="sm"
                          onClick={() => setAnomalyResolved(true)}
                          className="h-6 px-2 text-[10px] font-bold bg-amber-500 text-white hover:bg-amber-600"
                        >
                          Auto-Fix
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 font-medium animate-in fade-in">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Budget reallocated to Top-ROAS adset (+18% lift)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
                    <div className="text-xs font-medium text-muted-foreground">{t('demoPulseMrr')}</div>
                    <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      <span dir="ltr">
                        {pulseWindow === 'today' ? '$5,420' : pulseWindow === '7d' ? '$36,800' : t('demoPulseMrrValue')}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="success" trend="up" size="sm">
                        <span dir="ltr">+18.4%</span>
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{t('demoPulseVsLast30d')}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
                    <div className="text-xs font-medium text-muted-foreground">{t('demoPulseRoas')}</div>
                    <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      <span dir="ltr">
                        {pulseWindow === 'today' ? '4.1x' : pulseWindow === '7d' ? '3.6x' : t('demoPulseRoasValue')}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="success" trend="up" size="sm">
                        <span dir="ltr">+0.6x</span>
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{t('demoPulseTarget')} <span dir="ltr">2.8x</span></span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
                    <div className="text-xs font-medium text-muted-foreground">{t('demoPulsePayback')}</div>
                    <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      <span dir="ltr">{t('demoPulsePaybackValue')}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="success" trend="down" size="sm">
                        <span dir="ltr">-1.2 mo</span>
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{t('demoPulseVelocity')}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
                    <div className="text-xs font-medium text-muted-foreground">{t('demoPulseAccounts')}</div>
                    <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      <span dir="ltr">{t('demoPulseAccountsValue')}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="success" trend="up" size="sm">
                        <span dir="ltr">+142</span>
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{t('demoPulseNetAccounts')}</span>
                    </div>
                  </div>
                </div>

                {/* Pulse Ingestion Progress */}
                <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
                    <span>{t('demoThroughputTitle')}</span>
                    <span dir="ltr">4,820 {t('demoThroughputEventsPerSec')}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-[88%] bg-brand-gradient rounded-full" />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AD COCKPIT */}
            {activeTab === 'ads' && (
              <div className="space-y-4 animate-fade-in">
                {/* Platform Filter Controls */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border text-xs">
                    {(['all', 'google', 'meta'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAdsPlatformFilter(p)}
                        className={`rounded-md px-3 py-1 font-semibold transition-all ${
                          adsPlatformFilter === p
                            ? 'bg-card text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p === 'all' ? 'All Platforms' : p === 'google' ? 'Google Ads' : 'Meta Ads'}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    💡 Click status to toggle campaigns
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left rtl:text-right border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/80 text-xs font-semibold text-muted-foreground">
                        <th className="py-3 px-4">{t('demoAdsCampaignCol')}</th>
                        <th className="py-3 px-4">{t('demoAdsSpendCol')}</th>
                        <th className="py-3 px-4">{t('demoAdsConvCol')}</th>
                        <th className="py-3 px-4">{t('demoAdsCpaCol')}</th>
                        <th className="py-3 px-4">{t('demoAdsFatigueCol')}</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredCampaigns.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${row.color} shrink-0`} />
                            <span>{row.name}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono" dir="ltr">{row.spend}</td>
                          <td className="py-3.5 px-4 font-mono" dir="ltr">{row.conversions}</td>
                          <td className="py-3.5 px-4 font-mono" dir="ltr">{row.cpa}</td>
                          <td className="py-3.5 px-4">
                            <Badge
                              variant={row.fatiguePct > 70 ? 'success' : row.fatiguePct > 50 ? 'warning' : 'rose'}
                              size="sm"
                            >
                              <span>{row.fatiguePct > 70 ? 'Fresh' : 'Wearout'}</span> <span dir="ltr">({row.fatiguePct}%)</span>
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => toggleCampaignStatus(row.id)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                                row.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                                  : 'bg-muted text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {row.status === 'active' ? (
                                <>
                                  <Pause className="h-3 w-3" /> Pause
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3" /> Run
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: COHORT BREAKEVEN */}
            {activeTab === 'cohorts' && (
              <div className="space-y-4 animate-fade-in">
                {/* Cohort Metric Toggle */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border text-xs">
                    {(['payback', 'retention', 'ltv'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCohortMetric(m)}
                        className={`rounded-md px-3 py-1 font-semibold transition-all ${
                          cohortMetric === m
                            ? 'bg-card text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'payback' ? 'CAC Payback %' : m === 'retention' ? 'Account Retention' : 'Net LTV ($)'}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono text-emerald-600 font-bold">
                    🚀 Breakeven reached by Month 4
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left rtl:text-right border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/80 text-xs font-semibold text-muted-foreground">
                        <th className="py-3 px-4">{t('demoCohortMonthCol')}</th>
                        <th className="py-3 px-4">{t('demoCohortSizeCol')}</th>
                        <th className="py-3 px-4">{t('demoCohortM1Col')}</th>
                        <th className="py-3 px-4">{t('demoCohortM3Col')}</th>
                        <th className="py-3 px-4">{t('demoCohortM6Col')}</th>
                        <th className="py-3 px-4">{t('demoCohortM12Col')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <tr>
                        <td className="py-3.5 px-4 font-medium">{t('demoCohortJan')}</td>
                        <td className="py-3.5 px-4 font-mono"><span dir="ltr">120</span> {t('demoCohortAccts')}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold" dir="ltr">
                          {cohortMetric === 'payback' ? '100%' : cohortMetric === 'retention' ? '98%' : '$2,400'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '86%' : cohortMetric === 'retention' ? '91%' : '$4,800'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '78%' : cohortMetric === 'retention' ? '84%' : '$8,600'}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="emerald" size="sm">
                            <span>{t('demoCohortBreakeven')}</span> <span dir="ltr">(134%)</span>
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3.5 px-4 font-medium">{t('demoCohortFeb')}</td>
                        <td className="py-3.5 px-4 font-mono"><span dir="ltr">145</span> {t('demoCohortAccts')}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold" dir="ltr">
                          {cohortMetric === 'payback' ? '100%' : cohortMetric === 'retention' ? '99%' : '$2,800'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '89%' : cohortMetric === 'retention' ? '93%' : '$5,400'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '81%' : cohortMetric === 'retention' ? '87%' : '$9,200'}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="emerald" size="sm">
                            <span>{t('demoCohortBreakeven')}</span> <span dir="ltr">(142%)</span>
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3.5 px-4 font-medium">{t('demoCohortMar')}</td>
                        <td className="py-3.5 px-4 font-mono"><span dir="ltr">168</span> {t('demoCohortAccts')}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold" dir="ltr">
                          {cohortMetric === 'payback' ? '100%' : cohortMetric === 'retention' ? '100%' : '$3,200'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '92%' : cohortMetric === 'retention' ? '95%' : '$6,100'}
                        </td>
                        <td className="py-3.5 px-4 font-mono" dir="ltr">
                          {cohortMetric === 'payback' ? '85%' : cohortMetric === 'retention' ? '90%' : '$10,400'}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="info" size="sm">
                            <span>{t('demoCohortMonth6')}</span> <span dir="ltr">(96%)</span> <span>{t('demoCohortPaybackSuffix')}</span>
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: CONVERSION FUNNEL */}
            {activeTab === 'funnel' && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { step: 1, label: t('demoFunnelStep1'), val: '84,200', pct: '100%', sub: t('demoFunnelBaseline'), color: 'border-border' },
                    { step: 2, label: t('demoFunnelStep2'), val: '24,150', pct: '28.7%', sub: t('demoFunnelCtr'), color: 'border-blue-500' },
                    { step: 3, label: t('demoFunnelStep3'), val: '3,860', pct: '16.0%', sub: t('demoFunnelSignup'), color: 'border-indigo-500' },
                    { step: 4, label: t('demoFunnelStep4'), val: '1,840', pct: '47.7%', sub: t('demoFunnelPaid'), color: 'border-emerald-500' },
                  ].map((card) => (
                    <button
                      key={card.step}
                      type="button"
                      onClick={() => setActiveFunnelStep(card.step)}
                      className={`rounded-xl border p-4 text-center transition-all cursor-pointer ${
                        activeFunnelStep === card.step
                          ? 'border-2 border-primary bg-primary/5 shadow-md scale-102'
                          : 'border-border bg-card shadow-soft hover:border-border/80'
                      }`}
                    >
                      <div className="text-xs text-muted-foreground">{card.label}</div>
                      <div className="mt-2 text-2xl font-bold font-mono" dir="ltr">{card.val}</div>
                      <div className="mt-1 text-xs text-emerald-600 font-semibold"><span dir="ltr">{card.pct}</span> {card.sub}</div>
                    </button>
                  ))}
                </div>

                {/* Selected Funnel Stage Drilldown Box */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <span className="font-bold text-foreground">
                        Stage {activeFunnelStep} Optimization Insight:
                      </span>{' '}
                      <span className="text-muted-foreground">
                        {activeFunnelStep === 1 && 'Top-of-funnel ad CTR is healthy. Scaling high-affinity search queries.'}
                        {activeFunnelStep === 2 && 'Prompt-to-DOM edge personalization boosted landing page session-to-signup by +28.4%.'}
                        {activeFunnelStep === 3 && 'Onboarding wizard completion is 16.0%. PQL email alerts triggered automatically.'}
                        {activeFunnelStep === 4 && 'Checkout conversion from trial to paid is top 5th percentile in B2B benchmark.'}
                      </span>
                    </div>
                  </div>
                  <Badge variant="purple" size="sm" className="shrink-0">
                    AI Auto-Tuned
                  </Badge>
                </div>

                {/* Progress Bar Visualization */}
                <div className="p-4 rounded-xl border border-border/80 bg-muted/20">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>{t('demoFunnelConversionRate')}</span>
                    <span className="font-bold text-foreground"><span dir="ltr">2.18%</span> {t('demoFunnelOverall')}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-secondary flex">
                    <div className="h-full bg-blue-500" style={{ width: '45%' }} />
                    <div className="h-full bg-indigo-500" style={{ width: '30%' }} />
                    <div className="h-full bg-emerald-500" style={{ width: '25%' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

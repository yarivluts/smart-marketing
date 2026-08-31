'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  DollarSign,
  MousePointerClick,
  Percent,
  Target,
  Sparkles,
  Layers,
  BarChart3,
  Image as ImageIcon,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { CampaignListTable } from './campaign-list-table';
import { CreativePreviewGallery } from './creative-preview-gallery';
import { AutomationSeedTargetForm } from './automation-seed-target-form';
import { AutomationProposeCampaignDraftForm } from './automation-propose-campaign-draft-form';
import { ExecutiveBlendedReport } from './executive-blended-report';
import type {
  UnifiedCampaignItem,
  AdsPerformanceSummary,
} from '@/lib/orgs/ads-performance-synthesizer';
import type { AutomationConnectionOption, AutomationTargetView } from '@/lib/orgs/automation-view';
import type { CampaignSpendBreakdownOutcome } from '@/lib/orgs/queries';

export interface AdsPerformanceDashboardProps {
  orgId: string;
  projectId: string;
  projectName?: string;
  items: UnifiedCampaignItem[];
  summary: AdsPerformanceSummary;
  rawTargets: AutomationTargetView[];
  connections: AutomationConnectionOption[];
  canExecute: boolean;
  spendOutcome?: CampaignSpendBreakdownOutcome | null;
}

export function AdsPerformanceDashboard({
  orgId,
  projectId,
  projectName: _projectName,
  items: initialItems,
  summary,
  rawTargets,
  connections,
  canExecute,
  spendOutcome = null,
}: AdsPerformanceDashboardProps): React.ReactElement {

  const t = useTranslations('Campaigns');

  const [activeTab, setActiveTab] = useState<'overview' | 'creatives' | 'analytics'>('overview');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta_ads' | 'google_ads' | 'simulated'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Proactive recommendation state
  const [recommendationApplied, setRecommendationApplied] = useState(false);
  const [isApplyingRec, setIsApplyingRec] = useState(false);

  // Filtered campaigns for overview table
  const filteredItems = useMemo(() => {
    return initialItems.filter((item) => {
      const matchesPlatform = platformFilter === 'all' || item.platform === platformFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.label.toLowerCase().includes(query) ||
        item.targetId.toLowerCase().includes(query) ||
        (item.objective && item.objective.toLowerCase().includes(query));

      return matchesPlatform && matchesStatus && matchesSearch;
    });
  }, [initialItems, platformFilter, statusFilter, searchQuery]);

  // Target candidate for proactive recommendation (highest ROAS campaign)
  const topCampaign = useMemo(() => {
    return [...initialItems].sort((a, b) => b.roas - a.roas)[0];
  }, [initialItems]);

  async function handleApplyRecommendation(): Promise<void> {
    if (!topCampaign || !canExecute || isApplyingRec) return;
    setIsApplyingRec(true);

    try {
      const nextBudget = Math.round(topCampaign.dailyBudgetUsd * 1.2);
      const res = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetId: topCampaign.targetId,
            actionType: 'budget_change',
            afterDailyBudgetUsd: nextBudget,
          }),
        },
      );
      if (res.ok) {
        setRecommendationApplied(true);
      }
    } catch {
      // Best effort
    } finally {
      setIsApplyingRec(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-16" data-testid="ads-performance-dashboard">
      {/* Top Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('cockpitTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('cockpitDescription')}
          </p>
        </div>
      </div>

      {/* 1. Executive Blended KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="kpi-metric-cards">
        {/* Total Spend */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricTotalSpend')}</span>
            <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {`$${summary.totalSpendUsd.toLocaleString()}`}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground" dir="ltr">
            <span>{t('spendMetaShort', { amount: summary.metaSpendUsd.toLocaleString() })}</span>
            <span>{'•'}</span>
            <span>{t('spendGoogleShort', { amount: summary.googleSpendUsd.toLocaleString() })}</span>
          </div>
        </div>

        {/* Blended ROAS */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricBlendedRoas')}</span>
            <TrendingUp className="h-4 w-4 text-green-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-green-600 dark:text-green-400" dir="ltr">
            {`${summary.blendedRoas}x`}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground">
            <span dir="ltr">{t('roasTargetHint', { target: '2.8x' })}</span>
          </span>
        </div>

        {/* Impressions & Clicks */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricImpressionsClicks')}</span>
            <MousePointerClick className="h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {`${(summary.totalImpressions / 1000).toFixed(1)}K`}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
            {t('clicksCount', { count: summary.totalClicks.toLocaleString() })}
          </span>
        </div>

        {/* Average CTR */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricAvgCtr')}</span>
            <Percent className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {`${summary.blendedCtrPct}%`}
          </div>
          <span className="mt-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
            <span dir="ltr">{t('ctrBenchmarkComparison', { diff: '+0.4%' })}</span>
          </span>
        </div>

        {/* Blended CPA */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricBlendedCpa')}</span>
            <Target className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {`$${summary.blendedCpaUsd}`}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
            {t('conversionsCount', { count: summary.totalConversions })}
          </span>
        </div>

        {/* Active Campaigns */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('metricActiveCampaigns')}</span>
            <Layers className="h-4 w-4 text-purple-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {`${summary.activeCampaignsCount} / ${summary.totalCampaignsCount}`}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground">
            {t('liveDeliveryCount', { count: summary.activeCampaignsCount })}
          </span>
        </div>
      </div>

      {/* 2. In-Context Proactive AI Recommendation Card */}
      {topCampaign && (
        <div
          data-testid="proactive-recommendation-card"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/10 p-4 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                {t('proactiveRecommendationHeading')}
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">
                {t('proactiveRecommendationDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {recommendationApplied ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('recommendationApplied')}
              </span>
            ) : (
              <button
                type="button"
                disabled={!canExecute || isApplyingRec}
                onClick={handleApplyRecommendation}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('applyRecommendationButton')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex border-b border-border">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabOverview')}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {initialItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('creatives')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
              activeTab === 'creatives'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabCreatives')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
              activeTab === 'analytics'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabAnalytics')}</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Platform Filters */}
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setPlatformFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    platformFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterAllPlatforms')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('meta_ads')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    platformFilter === 'meta_ads'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterMetaAds')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('google_ads')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    platformFilter === 'google_ads'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterGoogleAds')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('simulated')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    platformFilter === 'simulated'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterSimulated')}
                </button>
              </div>

              {/* Status Filters */}
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterAllStatuses')}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('enabled')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'enabled'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterActive')}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('paused')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'paused'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterPaused')}
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-8 w-full rounded-lg border border-input bg-background ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Campaigns Table */}
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <Layers className="h-8 w-8 text-muted-foreground/50 mb-2" aria-hidden="true" />
              <p className="text-sm font-medium">{t('noCampaigns')}</p>
            </div>
          ) : (
            <CampaignListTable
              orgId={orgId}
              projectId={projectId}
              items={filteredItems}
              canExecute={canExecute}
              onSelectCreativesTab={() => setActiveTab('creatives')}
            />
          )}

          {/* Creation Section / Action Drawers */}
          {canExecute && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <h3 className="text-sm font-bold text-foreground mb-4">{t('seedTargetHeading')}</h3>
                <AutomationSeedTargetForm
                  orgId={orgId}
                  projectId={projectId}
                  connections={connections}
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <h3 className="text-sm font-bold text-foreground mb-4">{t('newCampaignHeading')}</h3>
                <AutomationProposeCampaignDraftForm
                  orgId={orgId}
                  projectId={projectId}
                  targets={rawTargets}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'creatives' && (
        <CreativePreviewGallery items={initialItems} />
      )}

      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-6" data-testid="analytics-tab">
          <ExecutiveBlendedReport
            targets={rawTargets}
            spendOutcome={spendOutcome}
            seed={projectId}
            canExecute={canExecute}
            onApplyRecommendation={handleApplyRecommendation}
          />
        </div>
      )}
    </div>
  );
}

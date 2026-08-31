'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sparkles,
  Layers,
  BarChart3,
  Image as ImageIcon,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { AdsKpiScorecards } from './ads-kpi-scorecards';
import { CampaignListTable } from './campaign-list-table';
import { CreativePreviewGallery } from './creative-preview-gallery';
import { AutomationSeedTargetForm } from '@/components/orgs/automation-seed-target-form';
import { AutomationProposeCampaignDraftForm } from '@/components/orgs/automation-propose-campaign-draft-form';
import { ExecutiveBlendedReport } from '@/components/reporting/executive-blended-report';
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
  className?: string;
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
  className = '',
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
    <div
      className={`flex flex-col gap-8 pb-16 ${className}`}
      data-testid="ads-performance-dashboard"
    >
      {/* Top Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('cockpitTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('cockpitDescription')}
          </p>
        </div>
      </div>

      {/* 1. Executive Blended KPI Cards */}
      <AdsKpiScorecards summary={summary} />

      {/* 2. AI Proactive Growth Recommendation Banner */}
      {topCampaign && (
        <div
          data-testid="proactive-recommendation-banner"
          className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 p-5 shadow-xs transition-all"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {t('proactiveRecommendationHeading')}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('proactiveRecommendationDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {recommendationApplied ? (
                <span
                  data-testid="rec-applied-badge"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>{t('recommendationApplied')}</span>
                </span>
              ) : (
                canExecute && (
                  <button
                    type="button"
                    onClick={handleApplyRecommendation}
                    disabled={isApplyingRec}
                    data-testid="apply-ads-rec-btn"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('applyRecommendationButton')}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabOverview')}</span>
            <span className="ms-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {initialItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('creatives')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition-colors cursor-pointer ${
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
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-bold transition-colors cursor-pointer ${
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
              <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setPlatformFilter('all')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    platformFilter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterAllPlatforms')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('meta_ads')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    platformFilter === 'meta_ads'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterMetaAds')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('google_ads')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    platformFilter === 'google_ads'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterGoogleAds')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter('simulated')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    platformFilter === 'simulated'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterSimulated')}
                </button>
              </div>

              {/* Status Filters */}
              <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterAllStatuses')}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('enabled')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'enabled'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('filterActive')}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('paused')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'paused'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
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
                className="h-9 w-full rounded-xl border border-input bg-background ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs"
              />
            </div>
          </div>

          {/* Campaigns Table */}
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
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
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
                <h3 className="text-sm font-bold text-foreground mb-4">{t('seedTargetHeading')}</h3>
                <AutomationSeedTargetForm
                  orgId={orgId}
                  projectId={projectId}
                  connections={connections}
                />
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
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

'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Code,
  Filter,
  RefreshCw,
  Sparkles,
  Radio,
} from 'lucide-react';
import { KpiRibbon } from './growth/kpi-ribbon';
import { ChannelRoiCard } from './growth/channel-roi-card';
import { CampaignLeaderboard } from './growth/campaign-leaderboard';
import { CreativePerformanceCard } from './growth/creative-performance-card';
import { AudienceSegmentationCard } from './growth/audience-segmentation-card';
import { FunnelConversionCard } from './growth/funnel-conversion-card';
import { ActionableInsightsCard } from './growth/actionable-insights-card';
import { TrackingSnippetModal } from './growth/tracking-snippet-modal';
import { LiveSourceStatusBar } from './growth/live-source-status-bar';
import { DemoModeBanner } from './growth/demo-mode-banner';
import { LiveEmptyStateCard } from './growth/live-empty-state-card';
import {
  getActionableInsights,
  getAudienceSegments,
  getCampaignLeaderboard,
  getChannelPerformances,
  getCreativePerformances,
  getDeviceBreakdown,
  getFunnelSteps,
  getGrowthKpis,
} from './growth/growth-data';
import type { GrowthChannelFilter, GrowthDateRange } from './growth/types';

export interface GrowthDashboardProps {
  orgId: string;
  projectId: string;
  projectName: string;
  hasGoogleAds?: boolean;
  hasMetaAds?: boolean;
  hasWebPixel?: boolean;
  pluginPackNames?: string[];
}

export function GrowthDashboard({
  orgId,
  projectId,
  projectName,
  hasGoogleAds = false,
  hasMetaAds = false,
  hasWebPixel = false,
  pluginPackNames = [],
}: GrowthDashboardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const hasConnectedSources = hasGoogleAds || hasMetaAds || hasWebPixel;

  const [isDemoMode, setIsDemoMode] = useState<boolean>(!hasConnectedSources);
  const [dateRange, setDateRange] = useState<GrowthDateRange>('30d');
  const [channelFilter, setChannelFilter] = useState<GrowthChannelFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const kpis = useMemo(
    () => getGrowthKpis(dateRange, channelFilter, !isDemoMode, hasConnectedSources),
    [dateRange, channelFilter, isDemoMode, hasConnectedSources],
  );
  const channels = useMemo(
    () => getChannelPerformances(dateRange, !isDemoMode, hasConnectedSources),
    [dateRange, isDemoMode, hasConnectedSources],
  );
  const campaigns = useMemo(
    () => getCampaignLeaderboard(channelFilter, projectName, !isDemoMode, hasConnectedSources),
    [channelFilter, projectName, isDemoMode, hasConnectedSources],
  );
  const creatives = useMemo(
    () => getCreativePerformances(channelFilter, projectName, !isDemoMode, hasConnectedSources),
    [channelFilter, projectName, isDemoMode, hasConnectedSources],
  );
  const audienceSegments = useMemo(
    () => getAudienceSegments(!isDemoMode, hasConnectedSources),
    [isDemoMode, hasConnectedSources],
  );
  const deviceBreakdown = useMemo(
    () => getDeviceBreakdown(!isDemoMode, hasConnectedSources),
    [isDemoMode, hasConnectedSources],
  );
  const funnelSteps = useMemo(
    () => getFunnelSteps(dateRange, !isDemoMode, hasConnectedSources),
    [dateRange, isDemoMode, hasConnectedSources],
  );
  const actionableInsights = useMemo(
    () => getActionableInsights(!isDemoMode, hasConnectedSources),
    [isDemoMode, hasConnectedSources],
  );

  function handleSync(): void {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 800);
  }

  const dateRangeOptions: { id: GrowthDateRange; labelKey: string }[] = [
    { id: '7d', labelKey: 'dateRange7d' },
    { id: '30d', labelKey: 'dateRange30d' },
    { id: 'this_month', labelKey: 'dateRangeThisMonth' },
    { id: '90d', labelKey: 'dateRange90d' },
  ];

  const channelOptions: { id: GrowthChannelFilter; labelKey: string }[] = [
    { id: 'all', labelKey: 'channelAll' },
    { id: 'google_ads', labelKey: 'channelGoogle' },
    { id: 'meta_ads', labelKey: 'channelMeta' },
    { id: 'tiktok', labelKey: 'channelTikTokFilter' },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header & Filter Controls Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-black tracking-tight text-foreground">{projectName}</h2>
            {isDemoMode ? (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('demoModeBadge')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Radio className="h-3.5 w-3.5" />
                <span>{t('liveDataBadge')}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('dashboardOverviewSubtitle')}</p>
        </div>

        {/* Action Buttons & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Selector */}
          <div className="flex items-center rounded-xl border border-border bg-background p-1 shadow-xs">
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDateRange(opt.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  dateRange === opt.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>

          {/* Quick Connect & Sync Buttons */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl text-xs font-semibold"
            onClick={() => setIsModalOpen(true)}
          >
            <Code className="h-3.5 w-3.5 text-primary" />
            <span>{t('connectCodeButton')}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-xl p-0"
            onClick={handleSync}
            disabled={isSyncing}
            title={t('syncData')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </div>
      </div>

      {/* 1. Real Source Status Ribbon */}
      <LiveSourceStatusBar
        orgId={orgId}
        projectId={projectId}
        hasGoogleAds={hasGoogleAds}
        hasMetaAds={hasMetaAds}
        hasWebPixel={hasWebPixel}
        pluginPackNames={pluginPackNames}
        onOpenSnippetModal={() => setIsModalOpen(true)}
      />

      {/* 2. Transparent Mode Banner (Demo vs Live) */}
      <DemoModeBanner
        projectName={projectName}
        isDemoMode={isDemoMode}
        onToggleMode={(demo) => setIsDemoMode(demo)}
        onOpenConnectModal={() => setIsModalOpen(true)}
      />

      {/* When in Live Mode without any connected traffic yet, show the Interactive Quick Connect Hub */}
      {!isDemoMode && !hasConnectedSources ? (
        <LiveEmptyStateCard
          orgId={orgId}
          projectId={projectId}
          projectName={projectName}
          onOpenSnippetModal={() => setIsModalOpen(true)}
          onSwitchToDemo={() => setIsDemoMode(true)}
        />
      ) : (
        <>
          {/* Channel Pills Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              <span>{`${t('filterByChannel')}:`}</span>
            </span>
            {channelOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannelFilter(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  channelFilter === c.id
                    ? 'bg-foreground text-background shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>

          {/* 3. High Level Executive KPI Ribbon */}
          <KpiRibbon kpis={kpis} />

          {/* 4. Cross-Channel ROI & Spend Distribution */}
          <ChannelRoiCard channels={channels} />

          {/* 5. Cross-Platform Campaign Leaderboard (Google, Meta, TikTok) */}
          <CampaignLeaderboard campaigns={campaigns} />

          {/* 6. Winning Ads & Creative Showcase */}
          <CreativePerformanceCard creatives={creatives} />

          {/* 7. Audience & Device Breakdown */}
          <AudienceSegmentationCard segments={audienceSegments} devices={deviceBreakdown} />

          {/* 8. End-to-End Funnel & Leak Points */}
          <FunnelConversionCard steps={funnelSteps} />

          {/* 9. Actionable Executive AI Growth Recommendations */}
          <ActionableInsightsCard insights={actionableInsights} />
        </>
      )}

      {/* Tracking Snippet & Integrations Modal */}
      <TrackingSnippetModal
        orgId={orgId}
        projectId={projectId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PpKpiCard } from '@/components/pastel/primitives';

export interface DashboardTelemetryGridProps {
  activeWorkspacesCount: number;
  overallReadinessPercent?: number;
  ingestUptime?: string;
  ingestLatency?: string;
  connectedPipelinesCount?: number;
  totalPipelinesCount?: number;
  pendingInvitesCount: number;
}

export function DashboardTelemetryGrid({
  activeWorkspacesCount,
  overallReadinessPercent = 100,
  ingestUptime,
  ingestLatency,
  connectedPipelinesCount,
  totalPipelinesCount,
  pendingInvitesCount,
}: DashboardTelemetryGridProps): React.ReactElement {
  const t = useTranslations('DashboardPage');

  const hasUptime = Boolean(ingestUptime && ingestUptime !== '—');
  const hasPipelines = Boolean(
    typeof connectedPipelinesCount === 'number' &&
      typeof totalPipelinesCount === 'number' &&
      (connectedPipelinesCount > 0 || totalPipelinesCount > 0),
  );

  return (
    <section aria-label="Key Health Indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Active Workspaces */}
        <PpKpiCard
          label={t('statsActiveWorkspaces')}
          value={activeWorkspacesCount}
          progress={overallReadinessPercent}
          badge={t('statusActive')}
          badgeAccent="primary"
          accent="primary"
          footer={t('statsActiveWorkspacesDesc')}
        />

        {/* 2. Ingestion Health */}
        <PpKpiCard
          label={t('statsIngestHealth')}
          value={ingestUptime ?? '—'}
          badge={hasUptime ? t('statusHealthy') : t('statusNoData')}
          badgeAccent={hasUptime ? 'mint' : 'neutral'}
          accent={hasUptime ? 'mint' : 'neutral'}
          footer={hasUptime ? (ingestLatency ? <span dir="ltr">{ingestLatency}</span> : t('statsIngestHealthDesc')) : t('noStreamActivityDesc')}
        />

        {/* 3. Connected Pipelines */}
        <PpKpiCard
          label={t('statsConnectedPipelines')}
          value={hasPipelines ? `${connectedPipelinesCount}/${totalPipelinesCount}` : '—'}
          badge={hasPipelines ? t('pipelinesSynced') : t('noPipelines')}
          badgeAccent={hasPipelines ? 'sky' : 'neutral'}
          accent={hasPipelines ? 'sky' : 'neutral'}
          footer={hasPipelines ? t('statsConnectedPipelinesDesc') : t('noPipelinesDesc')}
        />

        {/* 4. Pending Invitations */}
        <PpKpiCard
          label={t('statsPendingInvites')}
          value={pendingInvitesCount}
          badge={pendingInvitesCount > 0 ? t('badgeAction') : t('noPendingInvites')}
          badgeAccent={pendingInvitesCount > 0 ? 'amber' : 'neutral'}
          accent={pendingInvitesCount > 0 ? 'amber' : 'neutral'}
          footer={t('statsPendingInvitesDesc')}
        />
    </section>
  );
}

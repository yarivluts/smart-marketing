'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Activity, Building2, Database, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';

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
  ingestUptime = '99.98%',
  ingestLatency = '<18ms',
  connectedPipelinesCount = 3,
  totalPipelinesCount = 3,
  pendingInvitesCount,
}: DashboardTelemetryGridProps): React.ReactElement {
  const t = useTranslations('DashboardPage');

  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-label="Key Health Indicators"
    >
      {/* 1. Active Workspaces */}
      <StatCard
        title={t('statsActiveWorkspaces')}
        value={activeWorkspacesCount}
        icon={Building2}
        progress={overallReadinessPercent}
        badge={
          <Badge variant="secondary" size="sm" className="gap-1.5">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span>{t('statusActive')}</span>
          </Badge>
        }
        subtext={t('statsActiveWorkspacesDesc')}
      />

      {/* 2. Ingestion Health */}
      <StatCard
        title={t('statsIngestHealth')}
        value={ingestUptime}
        icon={Activity}
        progress={99.98}
        badge={
          <div className="flex items-center gap-1.5">
            <Badge variant="emerald" dot size="sm">
              {t('statusHealthy')}
            </Badge>
            <Badge variant="outline" size="sm" className="font-mono text-[10px]">
              <span dir="ltr">{ingestLatency}</span>
            </Badge>
          </div>
        }
        subtext={t('statsIngestHealthDesc')}
      />

      {/* 3. Connected Pipelines */}
      <StatCard
        title={t('statsConnectedPipelines')}
        value={`${connectedPipelinesCount}/${totalPipelinesCount}`}
        icon={Database}
        progress={100}
        badge={
          <Badge variant="info" dot size="sm">
            {t('pipelinesSynced')}
          </Badge>
        }
        subtext={t('statsConnectedPipelinesDesc')}
      />

      {/* 4. Pending Invitations */}
      <StatCard
        title={t('statsPendingInvites')}
        value={pendingInvitesCount}
        icon={Users}
        badge={
          pendingInvitesCount > 0 ? (
            <Badge variant="warning" dot size="sm">
              {t('badgeAction')}
            </Badge>
          ) : (
            <Badge variant="secondary" size="sm">
              {t('noPendingInvites')}
            </Badge>
          )
        }
        subtext={t('statsPendingInvitesDesc')}
      />
    </section>
  );
}

'use client';

import type { ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  BarChart3,
  Bot,
  Database,
  FolderOpen,
  Gauge,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Puzzle,
  Receipt,
  ShieldCheck,
  Target,
  Trophy,
  Tv,
  Users,
  Video,
  Webhook,
} from 'lucide-react';
import { FeatureCard } from './feature-card';

export interface FeatureLaunchpadPermissions {
  canManageBoards: boolean;
  canViewBoards: boolean;
  canManageSchemas: boolean;
  canManageMetrics: boolean;
  canViewIngestHealth: boolean;
  canManagePlugins: boolean;
  canRunAutomation: boolean;
  canManageKeys: boolean;
  canManageProjects: boolean;
  canViewAuditLog: boolean;
}

export interface FeatureLaunchpadProps {
  orgId: string;
  projectId: string;
  projectName: string;
  permissions: FeatureLaunchpadPermissions;
}

export function FeatureLaunchpad({
  orgId,
  projectId,
  projectName,
  permissions,
}: FeatureLaunchpadProps): ReactElement {
  const t = useTranslations('OrgDetailPage');
  const base = `/orgs/${orgId}/projects/${projectId}`;
  const openLabel = t('openFeature');

  const insightsFeatures = [
    ...(permissions.canViewBoards
      ? [
          {
            title: t('projectBoardsLink'),
            description: t('boardsDesc'),
            icon: LayoutGrid,
            href: `${base}/boards`,
            badge: 'Analytics',
          },
        ]
      : []),
    ...(permissions.canManageBoards
      ? [
          {
            title: t('projectGoalsLink'),
            description: t('goalsDesc'),
            icon: Target,
            href: `${base}/goals`,
            badge: 'KPIs',
          },
          {
            title: t('projectSegmentsLink'),
            description: t('segmentsDesc'),
            icon: Users,
            href: `${base}/segments`,
            badge: 'Cohorts',
          },
          {
            title: t('projectTvLink'),
            description: t('tvDesc'),
            icon: Tv,
            href: `${base}/tv`,
            badge: 'War Room',
          },
        ]
      : []),
    {
      title: t('winRulesTitle'),
      description: t('winRulesDesc'),
      icon: Trophy,
      href: `${base}/win-rules`,
      badge: 'Attribution',
    },
  ];

  const dataFeatures = [
    ...(permissions.canViewIngestHealth
      ? [
          {
            title: t('projectIngestHealthLink'),
            description: t('ingestHealthDesc'),
            icon: Activity,
            href: `${base}/ingest-health`,
            badge: 'Live',
          },
          {
            title: t('projectHooksLink'),
            description: t('hooksDesc'),
            icon: Webhook,
            href: `${base}/hooks`,
            badge: 'Webhooks',
          },
          {
            title: t('projectFieldMappingsLink'),
            description: t('fieldMappingsDesc'),
            icon: GitBranch,
            href: `${base}/field-mappings`,
            badge: 'Pipes',
          },
          {
            title: t('projectBillingOpsFeedLink'),
            description: t('billingOpsFeedDesc'),
            icon: Receipt,
            href: `${base}/billing-ops-feed`,
            badge: 'Billing',
          },
        ]
      : []),
    ...(permissions.canManageSchemas
      ? [
          {
            title: t('projectSchemaRegistryLink'),
            description: t('schemaRegistryDesc'),
            icon: Database,
            href: `${base}/schema-defs`,
            badge: 'Schemas',
          },
        ]
      : []),
    ...(permissions.canManageMetrics
      ? [
          {
            title: t('projectMetricRegistryLink'),
            description: t('metricCatalogDesc'),
            icon: BarChart3,
            href: `${base}/metric-defs`,
            badge: 'Catalog',
          },
        ]
      : []),
  ];

  const automationFeatures = [
    ...(permissions.canRunAutomation
      ? [
          {
            title: t('automationTitle'),
            description: t('automationDesc'),
            icon: Bot,
            href: `${base}/automation`,
            badge: 'AI Agents',
          },
        ]
      : []),
    ...(permissions.canManagePlugins
      ? [
          {
            title: t('projectPluginsLink'),
            description: t('pluginsDesc'),
            icon: Puzzle,
            href: `${base}/plugins`,
            badge: 'Integrations',
          },
        ]
      : []),
  ];

  const governanceFeatures = [
    {
      title: t('projectResourcesLink'),
      description: t('resourceLibraryDesc'),
      icon: FolderOpen,
      href: `${base}/resources`,
      badge: 'Library',
    },
    ...(permissions.canManageKeys
      ? [
          {
            title: t('projectKeysLink'),
            description: t('keysDesc'),
            icon: KeyRound,
            href: `${base}/keys`,
            badge: 'Tokens & MCP',
          },
        ]
      : []),
    ...(permissions.canManageProjects
      ? [
          {
            title: t('projectCostGuardrailsLink'),
            description: t('costGuardrailsDesc'),
            icon: Gauge,
            href: `${base}/cost-guardrails`,
            badge: 'Quotas',
          },
          {
            title: t('projectSessionReplayLink'),
            description: t('sessionReplayDesc'),
            icon: Video,
            href: `${base}/session-replay`,
            badge: 'Telemetry',
          },
        ]
      : []),
    ...(permissions.canViewAuditLog
      ? [
          {
            title: t('auditLogLink'),
            description: t('auditLogLinkDesc'),
            icon: ShieldCheck,
            href: `/orgs/${orgId}/audit-log`,
            badge: 'Audit Log',
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {t('launchpadHeading')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('launchpadSubheading', { projectName })}
        </p>
      </header>

      {/* Analytics & Growth */}
      {insightsFeatures.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="insights-heading">
          <div className="flex flex-col gap-1">
            <h3 id="insights-heading" className="text-lg font-semibold text-foreground">
              {t('categoryInsights')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('categoryInsightsDesc')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insightsFeatures.map((item) => (
              <FeatureCard
                key={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                href={item.href}
                badge={item.badge}
                actionLabel={openLabel}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Data Pipelines */}
      {dataFeatures.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="data-heading">
          <div className="flex flex-col gap-1">
            <h3 id="data-heading" className="text-lg font-semibold text-foreground">
              {t('categoryData')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('categoryDataDesc')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dataFeatures.map((item) => (
              <FeatureCard
                key={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                href={item.href}
                badge={item.badge}
                actionLabel={openLabel}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* AI & Automation */}
      {automationFeatures.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="automation-heading">
          <div className="flex flex-col gap-1">
            <h3 id="automation-heading" className="text-lg font-semibold text-foreground">
              {t('categoryAutomation')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('categoryAutomationDesc')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {automationFeatures.map((item) => (
              <FeatureCard
                key={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                href={item.href}
                badge={item.badge}
                actionLabel={openLabel}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Governance & Security */}
      {governanceFeatures.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="governance-heading">
          <div className="flex flex-col gap-1">
            <h3 id="governance-heading" className="text-lg font-semibold text-foreground">
              {t('categoryGovernance')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('categoryGovernanceDesc')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {governanceFeatures.map((item) => (
              <FeatureCard
                key={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                href={item.href}
                badge={item.badge}
                actionLabel={openLabel}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

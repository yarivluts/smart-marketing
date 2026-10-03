import type { ShellIconName } from '@/components/shell/shell-icons';
import { getHiddenModulesForProfile } from '@/lib/projects/project-profile';

export type NavClusterKey =
  | 'favorites'
  | 'executiveOverview'
  | 'marketingCockpit'
  | 'economicsCohorts'
  | 'mrrIntelligence'
  | 'productTelemetry'
  | 'dataIntegrations';

export interface NavItemConfig {
  id: string;
  subpath: string;
  labelKey: string;
  descriptionKey: string;
  iconName: ShellIconName;
  badgeKey?: string;
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning' | 'alert' | 'destructive';
  requiredConnector?: string;
  shortcut?: string;
  href?: string;
}

export interface NavClusterConfig {
  id: NavClusterKey;
  labelKey: string;
  descriptionKey?: string;
  iconName: ShellIconName;
  items: NavItemConfig[];
}

export interface NavConfig {
  clusters: NavClusterConfig[];
  mobileQuickItems: string[];
  defaultFavorites: string[];
}

export const DEFAULT_FAVORITE_ITEM_IDS: string[] = [
  'pulse',
  'campaigns',
  'cohorts',
  'billingOpsFeed',
  'funnel',
  'integrations',
];

export const MOBILE_QUICK_ITEM_IDS: string[] = [
  'pulse',
  'campaigns',
  'cohorts',
  'integrations',
  'automation',
];

export const NAV_CLUSTERS_CONFIG: NavClusterConfig[] = [
  {
    id: 'executiveOverview',
    labelKey: 'NavClusters.executiveOverview',
    descriptionKey: 'NavClusters.executiveOverviewDesc',
    iconName: 'Activity',
    items: [
      {
        id: 'pulse',
        subpath: '',
        labelKey: 'NavItems.pulse',
        descriptionKey: 'NavItems.pulseDesc',
        iconName: 'Activity',
      },
      {
        id: 'boards',
        subpath: '/boards',
        labelKey: 'NavItems.boards',
        descriptionKey: 'NavItems.boardsDesc',
        iconName: 'LayoutGrid',
      },
      {
        id: 'tv',
        subpath: '/tv',
        labelKey: 'NavItems.tv',
        descriptionKey: 'NavItems.tvDesc',
        iconName: 'Tv',
      },
      {
        id: 'insights',
        subpath: '/insights',
        labelKey: 'NavItems.insights',
        descriptionKey: 'NavItems.insightsDesc',
        iconName: 'Sparkles',
        badgeKey: 'NavItems.badgeAi',
        badgeVariant: 'secondary',
      },
    ],
  },
  {
    id: 'marketingCockpit',
    labelKey: 'NavClusters.marketingCockpit',
    descriptionKey: 'NavClusters.marketingCockpitDesc',
    iconName: 'Megaphone',
    items: [
      {
        id: 'adStudio',
        subpath: '/ad-studio',
        href: '/ad-studio',
        labelKey: 'adStudio',
        descriptionKey: 'adStudioDesc',
        iconName: 'Sparkles',
        badgeKey: 'NavItems.badgeAi',
        badgeVariant: 'secondary',
        shortcut: 'A',
      },
      {
        id: 'campaigns',
        subpath: '/campaigns',
        labelKey: 'NavItems.campaigns',
        descriptionKey: 'NavItems.campaignsDesc',
        iconName: 'Megaphone',
        badgeKey: 'NavItems.badgeLive',
        badgeVariant: 'success',
      },
      {
        id: 'campaignOps',
        subpath: '/campaign-ops',
        labelKey: 'NavItems.campaignOps',
        descriptionKey: 'NavItems.campaignOpsDesc',
        iconName: 'Rows3',
      },
      {
        id: 'firmographics',
        subpath: '/firmographics',
        labelKey: 'NavItems.firmographics',
        descriptionKey: 'NavItems.firmographicsDesc',
        iconName: 'Grid3x3',
      },
      {
        id: 'intentQuality',
        subpath: '/intent-quality',
        labelKey: 'NavItems.intentQuality',
        descriptionKey: 'NavItems.intentQualityDesc',
        iconName: 'Gauge',
      },
      {
        id: 'attribution',
        subpath: '/attribution',
        labelKey: 'NavItems.attribution',
        descriptionKey: 'NavItems.attributionDesc',
        iconName: 'GitBranch',
      },
    ],
  },
  {
    id: 'economicsCohorts',
    labelKey: 'NavClusters.economicsCohorts',
    descriptionKey: 'NavClusters.economicsCohortsDesc',
    iconName: 'TrendingUp',
    items: [
      {
        id: 'cohorts',
        subpath: '/cohorts',
        labelKey: 'NavItems.cohorts',
        descriptionKey: 'NavItems.cohortsDesc',
        iconName: 'TrendingUp',
      },
      {
        id: 'repCollections',
        subpath: '/rep-collections',
        labelKey: 'NavItems.repCollections',
        descriptionKey: 'NavItems.repCollectionsDesc',
        iconName: 'BarChart3',
      },
      {
        id: 'winRules',
        subpath: '/win-rules',
        labelKey: 'NavItems.winRules',
        descriptionKey: 'NavItems.winRulesDesc',
        iconName: 'Trophy',
      },
      {
        id: 'experiments',
        subpath: '/experiments',
        labelKey: 'NavItems.experiments',
        descriptionKey: 'NavItems.experimentsDesc',
        iconName: 'FlaskConical',
      },
    ],
  },
  {
    id: 'mrrIntelligence',
    labelKey: 'NavClusters.mrrIntelligence',
    descriptionKey: 'NavClusters.mrrIntelligenceDesc',
    iconName: 'Receipt',
    items: [
      {
        id: 'billingOpsFeed',
        subpath: '/billing-ops-feed',
        labelKey: 'NavItems.billingOpsFeed',
        descriptionKey: 'NavItems.billingOpsFeedDesc',
        iconName: 'Receipt',
      },
      {
        id: 'churnReasons',
        subpath: '/churn-reasons',
        labelKey: 'NavItems.churnReasons',
        descriptionKey: 'NavItems.churnReasonsDesc',
        iconName: 'UserX',
      },
      {
        id: 'customers',
        subpath: '/customers',
        labelKey: 'NavItems.customers',
        descriptionKey: 'NavItems.customersDesc',
        iconName: 'Users',
      },
      {
        id: 'costGuardrails',
        subpath: '/cost-guardrails',
        labelKey: 'NavItems.costGuardrails',
        descriptionKey: 'NavItems.costGuardrailsDesc',
        iconName: 'ShieldCheck',
      },
    ],
  },
  {
    id: 'productTelemetry',
    labelKey: 'NavClusters.productTelemetry',
    descriptionKey: 'NavClusters.productTelemetryDesc',
    iconName: 'Filter',
    items: [
      {
        id: 'funnel',
        subpath: '/funnel',
        labelKey: 'NavItems.funnel',
        descriptionKey: 'NavItems.funnelDesc',
        iconName: 'Filter',
      },
      {
        id: 'goals',
        subpath: '/goals',
        labelKey: 'NavItems.goals',
        descriptionKey: 'NavItems.goalsDesc',
        iconName: 'Target',
      },
      {
        id: 'sessionReplay',
        subpath: '/session-replay',
        labelKey: 'NavItems.sessionReplay',
        descriptionKey: 'NavItems.sessionReplayDesc',
        iconName: 'Video',
      },
      {
        id: 'segments',
        subpath: '/segments',
        labelKey: 'NavItems.segments',
        descriptionKey: 'NavItems.segmentsDesc',
        iconName: 'Users',
      },
      {
        id: 'automation',
        subpath: '/automation',
        labelKey: 'NavItems.automation',
        descriptionKey: 'NavItems.automationDesc',
        iconName: 'Bot',
        badgeKey: 'NavItems.badgeCopilot',
        badgeVariant: 'secondary',
      },
      {
        id: 'recordFeed',
        subpath: '/record-feed',
        labelKey: 'NavItems.recordFeed',
        descriptionKey: 'NavItems.recordFeedDesc',
        iconName: 'Rows3',
      },
    ],
  },
  {
    id: 'dataIntegrations',
    labelKey: 'NavClusters.dataIntegrations',
    descriptionKey: 'NavClusters.dataIntegrationsDesc',
    iconName: 'Database',
    items: [
      {
        id: 'setupChecklist',
        subpath: '/setup-checklist',
        labelKey: 'NavItems.setupChecklist',
        descriptionKey: 'NavItems.setupChecklistDesc',
        iconName: 'CheckCircle2',
      },
      {
        id: 'integrations',
        subpath: '/integrations',
        labelKey: 'NavItems.integrations',
        descriptionKey: 'NavItems.integrationsDesc',
        iconName: 'Database',
      },
      {
        id: 'ingestHealth',
        subpath: '/ingest-health',
        labelKey: 'NavItems.ingestHealth',
        descriptionKey: 'NavItems.ingestHealthDesc',
        iconName: 'Activity',
      },
      {
        id: 'hooks',
        subpath: '/hooks',
        labelKey: 'NavItems.hooks',
        descriptionKey: 'NavItems.hooksDesc',
        iconName: 'Webhook',
      },
      {
        id: 'keys',
        subpath: '/keys',
        labelKey: 'NavItems.keys',
        descriptionKey: 'NavItems.keysDesc',
        iconName: 'KeyRound',
      },
      {
        id: 'mcp',
        subpath: '/mcp',
        labelKey: 'NavItems.mcp',
        descriptionKey: 'NavItems.mcpDesc',
        iconName: 'Bot',
        badgeKey: 'NavItems.badgeAi',
        badgeVariant: 'secondary',
      },
      {
        id: 'schemaDefs',
        subpath: '/schema-defs',
        labelKey: 'NavItems.schemaDefs',
        descriptionKey: 'NavItems.schemaDefsDesc',
        iconName: 'GitBranch',
      },
      {
        id: 'metricDefs',
        subpath: '/metric-defs',
        labelKey: 'NavItems.metricDefs',
        descriptionKey: 'NavItems.metricDefsDesc',
        iconName: 'Award',
      },
      {
        id: 'fieldMappings',
        subpath: '/field-mappings',
        labelKey: 'NavItems.fieldMappings',
        descriptionKey: 'NavItems.fieldMappingsDesc',
        iconName: 'Filter',
      },
      {
        id: 'plugins',
        subpath: '/plugins',
        labelKey: 'NavItems.plugins',
        descriptionKey: 'NavItems.pluginsDesc',
        iconName: 'Puzzle',
      },
      {
        id: 'settings',
        subpath: '/settings',
        labelKey: 'NavItems.settings',
        descriptionKey: 'NavItems.settingsDesc',
        iconName: 'Settings',
      },
    ],
  },
];

export interface NavShellItem {
  id: string;
  href: string;
  label: string;
  description?: string;
  icon: ShellIconName;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning' | 'alert' | 'destructive';
  shortcut?: string;
  cluster: NavClusterKey;
}

export interface NavShellSection {
  clusterKey: NavClusterKey;
  heading?: string;
  items: NavShellItem[];
}

export interface BuildNavSectionsOptions {
  missingIntegrationsCount?: number;
  businessModel?: string;
  transactionType?: string;
  platformType?: string;
  primaryStack?: string;
  vertical?: string;
  customHiddenModules?: string[];
  verifiedRequirementsCount?: number;
  totalRequirementsCount?: number;
}

function buildHref(orgId: string, projectId: string, subpath: string): string {
  const base = `/orgs/${orgId}/projects/${projectId}`;
  if (!subpath) return orgId && projectId ? base : `${base}/`;
  return `${base}${subpath.startsWith('/') ? '' : '/'}${subpath}`;
}

export function buildProjectNavSections(
  orgId: string,
  projectId: string,
  t: (key: string) => string,
  options?: BuildNavSectionsOptions,
): NavShellSection[] {
  const hiddenItemIds = new Set(
    getHiddenModulesForProfile(
      options?.businessModel,
      options?.transactionType,
      options?.customHiddenModules,
    ),
  );

  return NAV_CLUSTERS_CONFIG.map((cluster) => {
    const heading = t(cluster.labelKey);
    const items: NavShellItem[] = cluster.items
      .filter((item) => !hiddenItemIds.has(item.id))
      .map((item) => {
        let badge = item.badgeKey ? t(item.badgeKey) : undefined;
        let badgeVariant = item.badgeVariant;

        if (item.id === 'integrations' && options?.missingIntegrationsCount && options.missingIntegrationsCount > 0) {
          badge = String(options.missingIntegrationsCount);
          badgeVariant = 'alert';
        }

        if (item.id === 'setupChecklist') {
          if (options?.verifiedRequirementsCount !== undefined && options?.totalRequirementsCount !== undefined) {
            badge = `${options.verifiedRequirementsCount}/${options.totalRequirementsCount}`;
            badgeVariant = options.verifiedRequirementsCount >= options.totalRequirementsCount ? 'success' : 'warning';
          } else {
            badge = t('NavItems.badgeSetup');
            badgeVariant = 'secondary';
          }
        }

        const resolveText = (k?: string): string | undefined => {
          if (!k) return undefined;
          const direct = t(k);
          if (direct !== k) return direct;
          const namespaced = t(k.includes('.') ? k : `NavItems.${k}`);
          if (namespaced !== `NavItems.${k}`) return namespaced;
          return direct;
        };

        return {
          id: item.id,
          href: buildHref(orgId, projectId, item.subpath || item.href || ''),
          label: resolveText(item.labelKey) ?? item.labelKey,
          description: resolveText(item.descriptionKey),
          icon: item.iconName,
          badge,
          badgeVariant,
          shortcut: item.shortcut,
          cluster: cluster.id,
        };
      });

    return {
      clusterKey: cluster.id,
      heading,
      items,
    };
  }).filter((section) => section.items.length > 0);
}

export function buildMobileTabItems(
  orgId: string,
  projectId: string,
  t: (key: string) => string,
  options?: BuildNavSectionsOptions,
): NavShellItem[] {
  const sections = buildProjectNavSections(orgId, projectId, t, options);
  const allItems = sections.flatMap((s) => s.items);
  const itemMap = new Map<string, NavShellItem>(allItems.map((item) => [item.id, item]));

  return MOBILE_QUICK_ITEM_IDS.map((id) => itemMap.get(id)).filter(
    (item): item is NavShellItem => Boolean(item),
  );
}

export function getNavConfig(orgId: string, projectId: string): NavConfig {
  const base = `/orgs/${orgId}/projects/${projectId}`;
  return {
    clusters: NAV_CLUSTERS_CONFIG.map((cluster) => ({
      ...cluster,
      items: cluster.items.map((item) => ({
        ...item,
        subpath: `${base}${item.subpath}`,
      })),
    })),
    mobileQuickItems: [...MOBILE_QUICK_ITEM_IDS],
    defaultFavorites: [...DEFAULT_FAVORITE_ITEM_IDS],
  };
}

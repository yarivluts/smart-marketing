'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { resolveShellIcon, type ShellIconName } from './shell-icons';
import type { CommandPaletteItem, CommandPaletteProps } from './nav-types';
import { searchOmniSearchItems, type OmniSearchItem } from '@growthos/shared';
import { cn } from '@/lib/utils';
import enMessages from '../../messages/en.json';

const CUSTOMER_SEARCH_MIN_QUERY_LENGTH = 2;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 200;

function useSafeTranslations(namespace: 'NavItems' | 'NavClusters' | 'CommandPalette') {
  try {
    return useTranslations(namespace);
  } catch {
    const section = (enMessages as unknown as Record<string, Record<string, string>>)[namespace] ?? {};
    return (key: string, values?: Record<string, unknown>) => {
      const val = key.includes('.')
        ? key.split('.').reduce<unknown>((acc, part) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined), section)
        : section[key];
      if (typeof val === 'string') {
        if (values && values.query) {
          return val.replace('{query}', String(values.query));
        }
        return val;
      }
      return key;
    };
  }
}

export function CommandPalette({
  orgId,
  projectId,
  customItems,
  isOpen,
  onOpenChange,
  triggerClassName,
}: CommandPaletteProps): React.ReactElement {
  const tNavItems = useSafeTranslations('NavItems');
  const tNavClusters = useSafeTranslations('NavClusters');
  const tCommandPalette = useSafeTranslations('CommandPalette');
  const router = useRouter();

  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isOpen ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof nextOpen === 'function' ? nextOpen(open) : nextOpen;
      if (onOpenChange) {
        onOpenChange(resolved);
      } else {
        setInternalOpen(resolved);
      }
    },
    [onOpenChange, open],
  );

  const [query, setQuery] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  // Live entity search state
  const [entityItems, setEntityItems] = React.useState<OmniSearchItem[] | null>(null);
  const [customerItems, setCustomerItems] = React.useState<OmniSearchItem[]>([]);
  const [, setLoadingEntities] = React.useState(false);

  const base = orgId && projectId ? `/orgs/${orgId}/projects/${projectId}` : '';

  // 6-Cluster Static Navigation Items
  const staticNavigationItems = React.useMemo<CommandPaletteItem[]>(() => {
    return [
      // Executive & Overview
      {
        id: 'pulse',
        title: tNavItems('pulse'),
        description: tNavItems('pulseDesc'),
        category: tNavClusters('executiveOverview'),
        categoryKey: 'executiveOverview',
        href: base || '/',
        icon: 'Activity',
        type: 'route',
      },
      {
        id: 'boards',
        title: tNavItems('boards'),
        description: tNavItems('boardsDesc'),
        category: tNavClusters('executiveOverview'),
        categoryKey: 'executiveOverview',
        href: base ? `${base}/boards` : '/boards',
        icon: 'LayoutGrid',
        type: 'route',
      },
      {
        id: 'tv',
        title: tNavItems('tv'),
        description: tNavItems('tvDesc'),
        category: tNavClusters('executiveOverview'),
        categoryKey: 'executiveOverview',
        href: base ? `${base}/tv` : '/tv',
        icon: 'Tv',
        type: 'route',
      },
      {
        id: 'insights',
        title: tNavItems('insights'),
        description: tNavItems('insightsDesc'),
        category: tNavClusters('executiveOverview'),
        categoryKey: 'executiveOverview',
        href: base ? `${base}/insights` : '/insights',
        icon: 'Sparkles',
        badge: tNavItems('badgeAi'),
        badgeVariant: 'secondary',
        type: 'route',
      },

      // Marketing & Ad Cockpit
      {
        id: 'adStudio',
        title: tNavItems('adStudio'),
        description: tNavItems('adStudioDesc'),
        category: tNavClusters('marketingCockpit'),
        categoryKey: 'marketingCockpit',
        href: base ? `${base}/ad-studio` : '/ad-studio',
        icon: 'Sparkles',
        badge: tNavItems('badgeAi'),
        badgeVariant: 'secondary',
        type: 'route',
      },
      {
        id: 'campaigns',
        title: tNavItems('campaigns'),
        description: tNavItems('campaignsDesc'),
        category: tNavClusters('marketingCockpit'),
        categoryKey: 'marketingCockpit',
        href: base ? `${base}/campaigns` : '/campaigns',
        icon: 'Megaphone',
        badge: tNavItems('badgeLive'),
        badgeVariant: 'success',
        type: 'route',
      },
      {
        id: 'campaignOps',
        title: tNavItems('campaignOps'),
        description: tNavItems('campaignOpsDesc'),
        category: tNavClusters('marketingCockpit'),
        categoryKey: 'marketingCockpit',
        href: base ? `${base}/campaign-ops` : '/campaign-ops',
        icon: 'Rows3',
        type: 'route',
      },
      {
        id: 'firmographics',
        title: tNavItems('firmographics'),
        description: tNavItems('firmographicsDesc'),
        category: tNavClusters('marketingCockpit'),
        categoryKey: 'marketingCockpit',
        href: base ? `${base}/firmographics` : '/firmographics',
        icon: 'Grid3x3',
        type: 'route',
      },
      {
        id: 'intentQuality',
        title: tNavItems('intentQuality'),
        description: tNavItems('intentQualityDesc'),
        category: tNavClusters('marketingCockpit'),
        categoryKey: 'marketingCockpit',
        href: base ? `${base}/intent-quality` : '/intent-quality',
        icon: 'Gauge',
        type: 'route',
      },

      // Economics & Cohorts
      {
        id: 'cohorts',
        title: tNavItems('cohorts'),
        description: tNavItems('cohortsDesc'),
        category: tNavClusters('economicsCohorts'),
        categoryKey: 'economicsCohorts',
        href: base ? `${base}/cohorts` : '/cohorts',
        icon: 'TrendingUp',
        type: 'route',
      },
      {
        id: 'repCollections',
        title: tNavItems('repCollections'),
        description: tNavItems('repCollectionsDesc'),
        category: tNavClusters('economicsCohorts'),
        categoryKey: 'economicsCohorts',
        href: base ? `${base}/rep-collections` : '/rep-collections',
        icon: 'BarChart3',
        type: 'route',
      },
      {
        id: 'winRules',
        title: tNavItems('winRules'),
        description: tNavItems('winRulesDesc'),
        category: tNavClusters('economicsCohorts'),
        categoryKey: 'economicsCohorts',
        href: base ? `${base}/win-rules` : '/win-rules',
        icon: 'Trophy',
        type: 'route',
      },
      {
        id: 'experiments',
        title: tNavItems('experiments'),
        description: tNavItems('experimentsDesc'),
        category: tNavClusters('economicsCohorts'),
        categoryKey: 'economicsCohorts',
        href: base ? `${base}/experiments` : '/experiments',
        icon: 'FlaskConical',
        type: 'route',
      },

      // MRR & Revenue Intelligence
      {
        id: 'billingOpsFeed',
        title: tNavItems('billingOpsFeed'),
        description: tNavItems('billingOpsFeedDesc'),
        category: tNavClusters('mrrIntelligence'),
        categoryKey: 'mrrIntelligence',
        href: base ? `${base}/billing-ops-feed` : '/billing-ops-feed',
        icon: 'Receipt',
        type: 'route',
      },
      {
        id: 'churnReasons',
        title: tNavItems('churnReasons'),
        description: tNavItems('churnReasonsDesc'),
        category: tNavClusters('mrrIntelligence'),
        categoryKey: 'mrrIntelligence',
        href: base ? `${base}/churn-reasons` : '/churn-reasons',
        icon: 'UserX',
        type: 'route',
      },
      {
        id: 'customers',
        title: tNavItems('customers'),
        description: tNavItems('customersDesc'),
        category: tNavClusters('mrrIntelligence'),
        categoryKey: 'mrrIntelligence',
        href: base ? `${base}/customers` : '/customers',
        icon: 'Users',
        type: 'route',
      },
      {
        id: 'costGuardrails',
        title: tNavItems('costGuardrails'),
        description: tNavItems('costGuardrailsDesc'),
        category: tNavClusters('mrrIntelligence'),
        categoryKey: 'mrrIntelligence',
        href: base ? `${base}/cost-guardrails` : '/cost-guardrails',
        icon: 'ShieldCheck',
        type: 'route',
      },

      // Product & Telemetry
      {
        id: 'funnel',
        title: tNavItems('funnel'),
        description: tNavItems('funnelDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/funnel` : '/funnel',
        icon: 'Filter',
        type: 'route',
      },
      {
        id: 'goals',
        title: tNavItems('goals'),
        description: tNavItems('goalsDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/goals` : '/goals',
        icon: 'Target',
        type: 'route',
      },
      {
        id: 'sessionReplay',
        title: tNavItems('sessionReplay'),
        description: tNavItems('sessionReplayDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/session-replay` : '/session-replay',
        icon: 'Video',
        type: 'route',
      },
      {
        id: 'segments',
        title: tNavItems('segments'),
        description: tNavItems('segmentsDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/segments` : '/segments',
        icon: 'Users',
        type: 'route',
      },
      {
        id: 'automation',
        title: tNavItems('automation'),
        description: tNavItems('automationDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/automation` : '/automation',
        icon: 'Bot',
        badge: tNavItems('badgeCopilot'),
        badgeVariant: 'secondary',
        type: 'route',
      },
      {
        id: 'recordFeed',
        title: tNavItems('recordFeed'),
        description: tNavItems('recordFeedDesc'),
        category: tNavClusters('productTelemetry'),
        categoryKey: 'productTelemetry',
        href: base ? `${base}/record-feed` : '/record-feed',
        icon: 'Rows3',
        type: 'route',
      },

      // Data & Integrations
      {
        id: 'integrations',
        title: tNavItems('integrations'),
        description: tNavItems('integrationsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/integrations` : '/integrations',
        icon: 'Database',
        type: 'route',
      },
      {
        id: 'ingestHealth',
        title: tNavItems('ingestHealth'),
        description: tNavItems('ingestHealthDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/ingest-health` : '/ingest-health',
        icon: 'Activity',
        type: 'route',
      },
      {
        id: 'hooks',
        title: tNavItems('hooks'),
        description: tNavItems('hooksDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/hooks` : '/hooks',
        icon: 'Webhook',
        type: 'route',
      },
      {
        id: 'keys',
        title: tNavItems('keys'),
        description: tNavItems('keysDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/keys` : '/keys',
        icon: 'KeyRound',
        type: 'route',
      },
      {
        id: 'schemaDefs',
        title: tNavItems('schemaDefs'),
        description: tNavItems('schemaDefsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/schema-defs` : '/schema-defs',
        icon: 'GitBranch',
        type: 'route',
      },
      {
        id: 'metricDefs',
        title: tNavItems('metricDefs'),
        description: tNavItems('metricDefsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/metric-defs` : '/metric-defs',
        icon: 'Award',
        type: 'route',
      },
      {
        id: 'fieldMappings',
        title: tNavItems('fieldMappings'),
        description: tNavItems('fieldMappingsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/field-mappings` : '/field-mappings',
        icon: 'Filter',
        type: 'route',
      },
      {
        id: 'plugins',
        title: tNavItems('plugins'),
        description: tNavItems('pluginsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/plugins` : '/plugins',
        icon: 'Puzzle',
        type: 'route',
      },
      {
        id: 'settings',
        title: tNavItems('settings'),
        description: tNavItems('settingsDesc'),
        category: tNavClusters('dataIntegrations'),
        categoryKey: 'dataIntegrations',
        href: base ? `${base}/settings` : '/settings',
        icon: 'Settings',
        type: 'route',
      },
    ];
  }, [base, tNavItems, tNavClusters]);

  // Fetch project entities lazily when dialog opens
  React.useEffect(() => {
    if (!open || !orgId || !projectId || entityItems !== null) {
      return;
    }
    let cancelled = false;
    setLoadingEntities(true);
    fetch(`/api/orgs/${orgId}/projects/${projectId}/omnisearch`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: OmniSearchItem[] }) => {
        if (!cancelled) {
          setEntityItems(data.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntityItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEntities(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId, projectId, entityItems]);

  // Debounced Customer 360 substring search
  React.useEffect(() => {
    const trimmed = query.trim();
    if (!open || !orgId || !projectId || trimmed.length < CUSTOMER_SEARCH_MIN_QUERY_LENGTH) {
      setCustomerItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/orgs/${orgId}/projects/${projectId}/omnisearch?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items?: OmniSearchItem[] }) => {
          if (!cancelled) {
            setCustomerItems(data.items ?? []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCustomerItems([]);
          }
        });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, orgId, projectId]);

  // Dynamic entity items converted to CommandPaletteItem
  const convertedEntityItems = React.useMemo<CommandPaletteItem[]>(() => {
    if (!entityItems) return [];
    const entityIconMap: Record<string, ShellIconName> = {
      board: 'LayoutGrid',
      metric: 'BarChart3',
      segment: 'Users',
      campaign: 'Megaphone',
      goal: 'Target',
      win_rule: 'Trophy',
      customer: 'User',
    };

    const staticMatches = searchOmniSearchItems(entityItems, query);
    const combinedEntities = [...staticMatches, ...customerItems];

    return combinedEntities.map((item) => ({
      id: `${item.type}-${item.id}`,
      title: item.label,
      description: item.description ?? `${item.type.toUpperCase()} entity`,
      category: tCommandPalette('categories.entities'),
      categoryKey: 'entities',
      href: item.href,
      icon: entityIconMap[item.type] ?? 'Search',
      badge: item.type,
      badgeVariant: 'secondary',
      type: item.type,
    }));
  }, [entityItems, query, customerItems, tCommandPalette]);

  const allItems = React.useMemo(() => {
    const baseItems = customItems ?? staticNavigationItems;
    if (query.trim()) {
      return [...baseItems, ...convertedEntityItems];
    }
    return baseItems;
  }, [customItems, staticNavigationItems, convertedEntityItems, query]);

  const filteredItems = React.useMemo(() => {
    if (!query.trim()) return allItems;
    const lower = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower),
    );
  }, [allItems, query]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredItems.length, query]);

  // Global Keyboard shortcut listener
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  function handleSelect(item: CommandPaletteItem) {
    setOpen(false);
    setQuery('');
    router.push(item.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, Math.max(filteredItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filteredItems[highlightedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  }

  const activeItem = filteredItems[highlightedIndex];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open command search - ${tCommandPalette('searchPlaceholder')}`}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-background/80 px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-soft transition-all hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
          triggerClassName,
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate text-start">{tCommandPalette('searchPlaceholder')}</span>
        <kbd className="hidden shrink-0 rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[8vh] backdrop-blur-md animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tCommandPalette('commandSearchDialog')}
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft-xl animate-zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3.5">
              <Search className="h-5 w-5 shrink-0 text-primary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={tCommandPalette('commandSearchInputPlaceholder')}
                aria-label={tCommandPalette('commandSearchInputPlaceholder')}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Badge variant="secondary" size="sm" className="hidden sm:inline-flex">
                {tCommandPalette('escToExit')}
              </Badge>
            </div>

            {/* 2-Column Results and Preview */}
            <div className="grid grid-cols-1 md:grid-cols-5 min-h-[320px] max-h-[460px]">
              {/* Left Column: Results List */}
              <div className="md:col-span-3 overflow-y-auto border-e border-border/60 p-2 space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    {tCommandPalette('noMatchingCommands', { query })}
                  </div>
                ) : (
                  filteredItems.map((item, index) => {
                    const isSelected = index === highlightedIndex;
                    const Icon = resolveShellIcon(item.icon);
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium shadow-soft'
                            : 'text-foreground hover:bg-muted/70',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <span className="block font-semibold truncate">{item.title}</span>
                            <span className="block text-[10px] text-muted-foreground truncate">
                              {item.category}
                            </span>
                          </div>
                        </div>
                        {item.badge ? (
                          <Badge variant="success" size="sm" className="text-[10px] py-0 px-1.5 shrink-0">
                            {item.badge}
                          </Badge>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 rtl:rotate-180 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Instant Visual Preview Pane */}
              <div className="hidden md:flex md:col-span-2 flex-col justify-between p-4 bg-muted/20">
                {activeItem ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                        {(() => {
                          const Icon = resolveShellIcon(activeItem.icon);
                          return <Icon className="h-4.5 w-4.5" />;
                        })()}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-foreground leading-tight truncate">
                          {activeItem.title}
                        </span>
                        <Badge variant="secondary" size="sm" className="mt-1 text-[9px] py-0">
                          {activeItem.category}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {activeItem.description}
                    </p>

                    <div className="rounded-xl border border-border/60 bg-card p-2.5 text-[11px] text-muted-foreground shadow-soft">
                      <span className="block font-medium text-foreground mb-1">
                        {tCommandPalette('previewRoute')}
                      </span>
                      <code className="text-[10px] text-primary break-all">{activeItem.href}</code>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {tCommandPalette('selectToPreview')}
                  </div>
                )}

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{tCommandPalette('previewNavigateHint')}</span>
                  <span>{tCommandPalette('previewArrowsHint')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

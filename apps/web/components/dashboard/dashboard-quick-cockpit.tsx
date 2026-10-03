'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  Activity,
  ArrowRight,
  Bot,
  Layers,
  Megaphone,
  Network,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export interface DashboardQuickCockpitProps {
  primaryOrgId?: string;
  primaryProjectId?: string;
}

export function DashboardQuickCockpit({
  primaryOrgId,
  primaryProjectId,
}: DashboardQuickCockpitProps): React.ReactElement {
  const t = useTranslations('DashboardPage');

  const getActionHref = (subpath: string): string => {
    if (primaryOrgId && primaryProjectId) {
      return `/orgs/${primaryOrgId}/projects/${primaryProjectId}/${subpath}`;
    }
    if (primaryOrgId) {
      return `/orgs/${primaryOrgId}`;
    }
    return '/orgs';
  };

  const actions = [
    {
      id: 'ads-cockpit',
      label: t('actionAdsCockpit'),
      desc: t('actionAdsCockpitDesc'),
      icon: Megaphone,
      badge: t('badgeRealtime'),
      href: getActionHref('campaigns'),
      colorClass:
        'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white',
    },
    {
      id: 'funnel-pipelines',
      label: t('actionFunnelPipelines'),
      desc: t('actionFunnelPipelinesDesc'),
      icon: Layers,
      badge: t('badgeCore'),
      href: getActionHref('funnel'),
      colorClass:
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white',
    },
    {
      id: 'cohorts-ltv',
      label: t('actionCohortsBreakeven'),
      desc: t('actionCohortsBreakevenDesc'),
      icon: TrendingUp,
      badge: t('badgeCore'),
      href: getActionHref('cohorts'),
      colorClass:
        'bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white',
    },
    {
      id: 'integrations-hub',
      label: t('actionIntegrationsHub'),
      desc: t('actionIntegrationsHubDesc'),
      icon: Network,
      badge: t('badgeRealtime'),
      href: getActionHref('integrations'),
      colorClass:
        'bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:bg-sky-600 group-hover:text-white',
    },
    {
      id: 'stream-health',
      label: t('actionStreamHealth'),
      desc: t('actionStreamHealthDesc'),
      icon: Activity,
      badge: t('badgeRealtime'),
      href: getActionHref('billing-ops-feed'),
      colorClass:
        'bg-rose-500/10 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white',
    },
    {
      id: 'copilot-guardrails',
      label: t('actionCopilotGuardrails'),
      desc: t('actionCopilotGuardrailsDesc'),
      icon: Bot,
      badge: t('badgeAutonomous'),
      href: getActionHref('cost-guardrails'),
      colorClass:
        'bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white',
    },
  ];

  return (
    <section className="flex flex-col gap-3.5" aria-label="Quick-Action Cockpit">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>{t('quickActionsHeading')}</span>
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('quickActionsSubheading')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              href={action.href}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md p-4 sm:p-4 text-start shadow-soft transition-all duration-200 min-h-[56px] sm:min-h-[110px] hover:-translate-y-1 hover:shadow-soft-lg hover:border-primary/50 hover:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${action.colorClass}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">
                    {action.badge}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {action.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {action.desc}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-end text-xs font-semibold text-primary pt-2 border-t border-border/40">
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

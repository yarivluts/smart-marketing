'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Eye, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { CampaignStatusToggle } from './campaign-status-toggle';
import { CampaignDailyBudgetControl } from './campaign-daily-budget-control';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

export interface CampaignListTableProps {
  orgId: string;
  projectId: string;
  items: UnifiedCampaignItem[];
  canExecute: boolean;
  onSelectCreativesTab?: () => void;
  className?: string;
}

export function CampaignListTable({
  orgId,
  projectId,
  items,
  canExecute,
  onSelectCreativesTab,
  className = '',
}: CampaignListTableProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  const PLATFORM_CONFIG = {
    meta_ads: {
      badgeVariant: 'default' as const,
      customClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    },
    google_ads: {
      badgeVariant: 'success' as const,
      customClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    simulated: {
      badgeVariant: 'secondary' as const,
      customClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    },
  };

  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-border bg-card shadow-xs ${className}`}
      data-testid="campaign-list-table"
    >
      <table className="w-full text-start text-xs">
        <thead className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnCampaign')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnStatus')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnDailyBudget')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnSpend')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnRoas')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-start">
              {t('columnPerformance')}
            </th>
            <th scope="col" className="px-5 py-3.5 text-end">
              {t('columnActions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const platformCfg = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.simulated;
            const platformName = t(`platform.${item.platform}`, { defaultMessage: item.platform });

            return (
              <tr
                key={item.id}
                className="transition-colors hover:bg-muted/30"
                data-testid={`campaign-row-${item.id}`}
              >
                {/* Campaign & Platform */}
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${platformCfg.customClass}`}
                      >
                        {platformName}
                      </span>
                      <Link
                        href={`/orgs/${orgId}/projects/${projectId}/campaigns/${item.targetId}`}
                        className="font-bold text-foreground hover:text-primary hover:underline leading-tight flex items-center gap-1"
                      >
                        <span>{item.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-60" aria-hidden="true" />
                      </Link>
                    </div>
                    {item.objective ? (
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[220px]">
                        {item.objective}
                      </span>
                    ) : null}
                  </div>
                </td>

                {/* Status Toggle */}
                <td className="px-5 py-4">
                  <CampaignStatusToggle
                    orgId={orgId}
                    projectId={projectId}
                    targetId={item.targetId}
                    campaignLabel={item.label}
                    initialStatus={item.status}
                    disabled={!canExecute}
                  />
                </td>

                {/* Daily Budget Control */}
                <td className="px-5 py-4">
                  <CampaignDailyBudgetControl
                    orgId={orgId}
                    projectId={projectId}
                    targetId={item.targetId}
                    campaignLabel={item.label}
                    initialDailyBudgetUsd={item.dailyBudgetUsd}
                    disabled={!canExecute}
                  />
                </td>

                {/* Spend (30d) */}
                <td className="px-5 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground text-xs" dir="ltr">
                      {`$${item.spend30dUsd.toLocaleString()}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t('conversionsCountShort', { count: item.conversions })}
                    </span>
                  </div>
                </td>

                {/* ROAS Badge */}
                <td className="px-5 py-4">
                  <Badge
                    variant={item.roas >= 3.0 ? 'success' : item.roas >= 2.0 ? 'warning' : 'secondary'}
                    size="sm"
                    className="font-bold"
                  >
                    <TrendingUp className="h-3 w-3 me-1 shrink-0" aria-hidden="true" />
                    <span dir="ltr">{`${item.roas}x`}</span>
                  </Badge>
                </td>

                {/* Performance (CTR / CPA) */}
                <td className="px-5 py-4">
                  <div className="flex flex-col text-[11px] gap-0.5">
                    <span className="font-semibold text-foreground">
                      <span dir="ltr">{`${item.ctrPct}%`}</span> {t('ctrLabel')}
                    </span>
                    <span className="text-muted-foreground">
                      <span dir="ltr">{`$${item.cpaUsd}`}</span> {t('cpaLabel')}
                    </span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-5 py-4 text-end">
                  <div className="inline-flex items-center gap-2">
                    {onSelectCreativesTab ? (
                      <button
                        type="button"
                        onClick={onSelectCreativesTab}
                        className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground hover:bg-secondary/80 shadow-2xs cursor-pointer transition-colors"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>{t('quickViewCreatives')}</span>
                      </button>
                    ) : null}
                    <Link
                      href={`/orgs/${orgId}/projects/${projectId}/campaigns/${item.targetId}`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={t('inspectTarget')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
      <table className="block w-full text-start text-xs md:table">
        <thead className="sr-only border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:not-sr-only md:table-header-group">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnCampaign')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnStatus')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnDailyBudget')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnSpend')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnRoas')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-start">
              {t('columnPerformance')}
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3.5 text-end">
              {t('columnActions')}
            </th>
          </tr>
        </thead>
        <tbody className="flex flex-col gap-3 p-3 md:table-row-group md:divide-y md:divide-border md:p-0">
          {items.map((item) => {
            const platformCfg = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.simulated;
            const platformName = t(`platform.${item.platform}`, { defaultMessage: item.platform });

            return (
              <tr
                key={item.id}
                className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-background/60 p-3.5 shadow-2xs transition-colors hover:bg-muted/30 md:table-row md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
                data-testid={`campaign-row-${item.id}`}
              >
                {/* Campaign & Platform */}
                <td className="block md:table-cell md:px-4 md:py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold ${platformCfg.customClass}`}
                      >
                        {platformName}
                      </span>
                      <Link
                        href={`/orgs/${orgId}/projects/${projectId}/campaigns/${item.targetId}`}
                        className="flex min-w-0 items-center gap-1 font-bold leading-tight text-foreground hover:text-primary hover:underline"
                      >
                        <span className="truncate" dir="auto">{item.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" aria-hidden="true" />
                      </Link>
                    </div>
                    {item.objective ? (
                      <span className="max-w-[220px] truncate font-mono text-[10px] text-muted-foreground" dir="auto">
                        {item.objective}
                      </span>
                    ) : null}
                  </div>
                </td>

                {/* Status Toggle */}
                <td
                  data-label={t('columnStatus')}
                  className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
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
                <td
                  data-label={t('columnDailyBudget')}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
                  <CampaignDailyBudgetControl
                    orgId={orgId}
                    projectId={projectId}
                    targetId={item.targetId}
                    campaignLabel={item.label}
                    initialDailyBudgetUsd={item.dailyBudgetUsd}
                    disabled={!canExecute}
                  />
                </td>

                {/*
                  Spend, ROAS, CTR and CPA are each null when GrowthOS has no measurement,
                  and every one of these cells renders "No data" rather than a figure. The
                  warehouse supplies spend only; the rest have no source wired up yet.
                */}
                {/* Spend (30d) */}
                <td
                  data-label={t('columnSpend')}
                  className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
                  <div className="flex flex-col items-end md:items-start">
                    <span className="whitespace-nowrap text-xs font-bold text-foreground" dir="ltr">
                      {item.spend30dUsd === null ? t('noData') : `$${item.spend30dUsd.toLocaleString()}`}
                    </span>
                    {item.conversions === null ? null : (
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                        {t('conversionsCountShort', { count: item.conversions })}
                      </span>
                    )}
                  </div>
                </td>

                {/* ROAS Badge */}
                <td
                  data-label={t('columnRoas')}
                  className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
                  {item.roas === null ? (
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t('noData')}</span>
                  ) : (
                    <Badge
                      variant={item.roas >= 3.0 ? 'success' : item.roas >= 2.0 ? 'warning' : 'secondary'}
                      size="sm"
                      className="font-bold"
                    >
                      <TrendingUp className="me-1 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span dir="ltr">{`${item.roas}x`}</span>
                    </Badge>
                  )}
                </td>

                {/* Performance (CTR / CPA) */}
                <td
                  data-label={t('columnPerformance')}
                  className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
                  <div className="flex flex-col items-end gap-0.5 text-[11px] md:items-start">
                    {item.ctrPct === null && item.cpaUsd === null ? (
                      <span className="whitespace-nowrap text-muted-foreground">{t('noData')}</span>
                    ) : (
                      <>
                        {item.ctrPct === null ? null : (
                          <span className="whitespace-nowrap font-semibold text-foreground">
                            <span dir="ltr">{`${item.ctrPct}%`}</span> {t('ctrLabel')}
                          </span>
                        )}
                        {item.cpaUsd === null ? null : (
                          <span className="whitespace-nowrap text-muted-foreground">
                            <span dir="ltr">{`$${item.cpaUsd}`}</span> {t('cpaLabel')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td
                  data-label={t('columnActions')}
                  className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 text-end before:content-[attr(data-label)] before:text-[11px] before:font-medium before:text-muted-foreground md:table-cell md:border-0 md:px-4 md:py-4 md:before:content-none"
                >
                  <div className="inline-flex items-center gap-2">
                    {onSelectCreativesTab ? (
                      <button
                        type="button"
                        onClick={onSelectCreativesTab}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground shadow-2xs transition-colors hover:bg-secondary/80"
                      >
                        <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{t('quickViewCreatives')}</span>
                      </button>
                    ) : null}
                    <Link
                      href={`/orgs/${orgId}/projects/${projectId}/campaigns/${item.targetId}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

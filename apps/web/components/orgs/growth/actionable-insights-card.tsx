'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Rocket, AlertTriangle, Lightbulb, Compass } from 'lucide-react';
import type { ActionableInsightItem } from './types';

export interface ActionableInsightsCardProps {
  insights: ActionableInsightItem[];
}

export function ActionableInsightsCard({ insights }: ActionableInsightsCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const icons = {
    scale: Rocket,
    alert: AlertTriangle,
    creative: Lightbulb,
    audience: Compass,
  };

  return (
    <Card className="flex flex-col gap-5 p-6 bg-card border-border shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('insightsTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('insightsSubtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t('autonomousRecommendationsBadge')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {insights.map((ins) => {
          const Icon = icons[ins.type] ?? Sparkles;
          return (
            <div
              key={ins.id}
              className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition-all ${
                ins.severity === 'opportunity'
                  ? 'border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.06]'
                  : ins.severity === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/[0.03] dark:bg-amber-500/[0.06]'
                    : 'border-border bg-background'
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`rounded-lg p-1.5 ${
                        ins.severity === 'opportunity'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : ins.severity === 'warning'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-bold text-foreground">{t(ins.titleKey)}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      ins.severity === 'opportunity'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : ins.severity === 'warning'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t(ins.impactKey)}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">{t(ins.descriptionKey)}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-[11px] font-semibold text-primary">{t('suggestedActionLabel')}</span>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs font-bold hover:bg-primary hover:text-white transition-colors">
                  <span>{t(ins.actionKey)}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

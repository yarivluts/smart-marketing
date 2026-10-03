import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

export function LandingComparison(): React.ReactElement {
  const t = useTranslations('HomePage');

  const comparisonRows = [
    {
      feature: t('compRealtime'),
      growthos: true,
      growthosNote: t('compRealtimeGrowthOS'),
      legacy: false,
      legacyNote: t('compRealtimeLegacy'),
    },
    {
      feature: t('compAdAttribution'),
      growthos: true,
      growthosNote: t('compAdAttributionGrowthOS'),
      legacy: false,
      legacyNote: t('compAdAttributionLegacy'),
    },
    {
      feature: t('compCohortBreakeven'),
      growthos: true,
      growthosNote: t('compCohortBreakevenGrowthOS'),
      legacy: false,
      legacyNote: t('compCohortBreakevenLegacy'),
    },
    {
      feature: t('compWarRoomTv'),
      growthos: true,
      growthosNote: t('compWarRoomTvGrowthOS'),
      legacy: false,
      legacyNote: t('compWarRoomTvLegacy'),
    },
    {
      feature: t('compHebrewRtl'),
      growthos: true,
      growthosNote: t('compHebrewRtlGrowthOS'),
      legacy: false,
      legacyNote: t('compHebrewRtlLegacy'),
    },
    {
      feature: t('compConnectors'),
      growthos: true,
      growthosNote: t('compConnectorsGrowthOS'),
      legacy: false,
      legacyNote: t('compConnectorsLegacy'),
    },
  ];

  return (
    <section id="comparison" className="py-20 md:py-28 bg-muted/20 border-t border-border/40">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center mb-16">
          <Badge variant="emerald" size="sm" className="mb-3">
            {t('compBadge')}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t('comparisonHeading')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-base sm:text-lg">
            {t('comparisonSubheading')}
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card shadow-soft-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-4 px-6 font-semibold text-foreground text-sm sm:text-base w-1/3">
                    {t('compFeatureCol')}
                  </th>
                  <th className="py-4 px-6 font-bold text-primary text-sm sm:text-base w-1/3 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span>{t('compGrowthOSCol')}</span>
                    </div>
                  </th>
                  <th className="py-4 px-6 font-medium text-muted-foreground text-sm sm:text-base w-1/3">
                    {t('compLegacyCol')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {comparisonRows.map((row, index) => (
                  <tr key={index} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-medium text-foreground">
                      {row.feature}
                    </td>
                    <td className="py-4 px-6 bg-primary/5">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-foreground">
                          {row.growthosNote}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-muted-foreground">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 mt-0.5">
                          <X className="h-3.5 w-3.5 stroke-[2.5]" />
                        </div>
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          {row.legacyNote}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

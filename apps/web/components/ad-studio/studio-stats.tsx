import type * as React from 'react';
import { useTranslations } from 'next-intl';
import { Clock, FileText, Film, ImageIcon, Sparkles } from 'lucide-react';
import { limitUsedPercent } from '@/lib/ad-studio/view';
import { StatCard } from '@/components/ui/stat-card';

export interface StudioStatsProps {
  overview: { briefs: number; scripted: number; scriptedSeconds: number };
  usageToday: { textGenerations: number; videoSeconds: number; images: number };
  limits: { text: number; video: number; images: number };
}

/**
 * The figure cards on the list of ads. Before the first ad exists every card would read 0 beside a
 * daily limit the person has never heard of, so a newcomer sees none of them until there is an ad.
 */
export function StudioStats({ overview, usageToday, limits }: StudioStatsProps): React.ReactElement | null {
  const t = useTranslations('AdStudio');
  if (overview.briefs === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="ad-studio-stats">
      <StatCard title={t('kpiAds')} value={overview.briefs} icon={FileText} />
      <StatCard title={t('kpiScripted')} value={overview.scripted} icon={Film} subtext={t('kpiScriptedHint', { seconds: overview.scriptedSeconds })} />
      <StatCard
        title={t('kpiTextToday')}
        value={usageToday.textGenerations}
        icon={Sparkles}
        subtext={t('kpiOfLimit', { limit: limits.text })}
        progress={limitUsedPercent(usageToday.textGenerations, limits.text)}
      />
      <StatCard
        title={t('kpiVideoToday')}
        value={usageToday.videoSeconds}
        icon={Clock}
        subtext={t('kpiOfLimit', { limit: limits.video })}
        progress={limitUsedPercent(usageToday.videoSeconds, limits.video)}
      />
      <StatCard
        title={t('usageTodayImages')}
        value={usageToday.images}
        icon={ImageIcon}
        subtext={t('kpiOfLimit', { limit: limits.images })}
        progress={limitUsedPercent(usageToday.images, limits.images)}
      />
    </div>
  );
}

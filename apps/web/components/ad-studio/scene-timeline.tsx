'use client';

import { useTranslations } from 'next-intl';
import { AD_STUDIO_MAX_TOTAL_SECONDS, totalSceneSeconds, type AdStudioScene } from '@growthos/shared';
import { buildSceneTimeline } from '@/lib/ad-studio/view';
import { cn } from '@/lib/utils';

const SEGMENT_TONES = ['bg-primary', 'bg-primary/70', 'bg-primary/50', 'bg-primary/35'];

/**
 * The script on a fixed one-minute ruler: each scene a segment as wide as its share of 60 seconds,
 * so the space left - or the overrun - is visible before anything is saved or rendered.
 */
export function SceneTimeline({ scenes, activeSceneId }: { scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds'>[]; activeSceneId?: string | null }): React.ReactElement {
  const t = useTranslations('AdStudio');
  const segments = buildSceneTimeline(scenes);
  const total = totalSceneSeconds(scenes.map((scene) => ({ durationSeconds: Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : 0 })));
  const over = total - AD_STUDIO_MAX_TOTAL_SECONDS;
  return (
    <div className="flex flex-col gap-1.5" data-testid="ad-studio-timeline">
      <div className="flex items-baseline justify-between text-xs">
        <span className={cn('font-semibold tabular-nums', over > 0 ? 'text-destructive' : 'text-foreground')}>{t('totalOfMax', { total })}</span>
        {over > 0 ? <span className="text-destructive">{t('overLimit', { seconds: over })}</span> : null}
      </div>
      <div className="relative flex h-7 w-full overflow-hidden rounded-lg bg-muted" dir="ltr" role="img" aria-label={t('totalOfMax', { total })}>
        {segments.map((segment, index) => (
          <div
            key={segment.id}
            className={cn(
              'flex h-full items-center justify-center border-e border-background text-[10px] font-semibold text-primary-foreground transition-all',
              segment.overLimit ? 'bg-destructive' : SEGMENT_TONES[index % SEGMENT_TONES.length],
              activeSceneId === segment.id && 'ring-2 ring-inset ring-foreground/60',
            )}
            style={{ width: `${Math.min(segment.widthPercent, 100)}%` }}
            title={t('sceneLabel', { number: segment.position })}
          >
            {segment.widthPercent >= 6 ? segment.position : null}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums" dir="ltr" aria-hidden="true">
        {[0, 15, 30, 45, 60].map((mark) => (
          <span key={mark} dir="auto">
            {t('secondsShort', { seconds: mark })}
          </span>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { AD_STUDIO_MAX_TOTAL_SECONDS, totalSceneSeconds, type AdStudioScene } from '@growthos/shared';
import { buildSceneTimeline } from '@/lib/ad-studio/view';
import { cn } from '@/lib/utils';

const SEGMENT_TONES = ['bg-primary', 'bg-primary/70', 'bg-primary/50', 'bg-primary/35'];

/**
 * The script on a fixed one-minute ruler: each scene a segment as wide as its share of 60 seconds,
 * so the space left - or the overrun - is visible before anything is saved or rendered. The bar and
 * its ruler follow the page direction: in Hebrew the first scene starts at the right (KAN-371).
 */
export function SceneTimeline({
  scenes,
  activeSceneId,
  compact = false,
}: {
  scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds'>[];
  activeSceneId?: string | null;
  compact?: boolean;
}): React.ReactElement {
  const t = useTranslations('AdStudio');
  const segments = buildSceneTimeline(scenes);
  const total = totalSceneSeconds(scenes.map((scene) => ({ durationSeconds: Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : 0 })));
  const over = total - AD_STUDIO_MAX_TOTAL_SECONDS;
  return (
    <div className="flex flex-col gap-1.5" data-testid="ad-studio-timeline">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        {compact ? <span className="font-medium text-muted-foreground">{t('list.timelineLabel')}</span> : null}
        <div className={cn('flex items-baseline gap-2', !compact && 'w-full justify-between')}>
          <span className={cn('font-semibold tabular-nums', over > 0 ? 'text-destructive' : 'text-foreground')}>{t('totalOfMax', { total })}</span>
          {over > 0 ? <span className="text-destructive">{t('overLimit', { seconds: over })}</span> : null}
        </div>
      </div>
      <div
        className={cn(
          'relative flex w-full overflow-hidden bg-muted',
          compact ? 'h-2.5 rounded-full' : 'h-7 rounded-lg',
        )}
        role="img"
        aria-label={t('totalOfMax', { total })}
      >
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
            {!compact && segment.widthPercent >= 6 ? segment.position : null}
          </div>
        ))}
      </div>
      {!compact ? (
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums" aria-hidden="true">
          {[0, 15, 30, 45, 60].map((mark) => (
            <span key={mark} dir="auto">
              {t('secondsShort', { seconds: mark })}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

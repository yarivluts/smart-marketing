'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clapperboard, Film, ImageIcon, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { withFirstFrame } from './media-src';

export interface CreateGalleryImage {
  id: string;
  label: string;
  /** The placement, so the tile has the image's own shape (and a pending one keeps its place). */
  format: 'square' | 'portrait' | 'story' | 'landscape';
  status: 'generating' | 'ready' | 'failed';
}

export interface CreateGalleryScene {
  id: string;
  number: number;
  /** The newest clip of the scene, if any. */
  clip: { id: string; status: 'generating' | 'ready' | 'failed' } | null;
}

const IMAGE_ASPECT: Record<CreateGalleryImage['format'], string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16]',
  landscape: 'aspect-video',
};

type GalleryFilter = 'all' | 'images' | 'scenes';

/**
 * Pastel Pulse gallery for Step 3 (Create): swipeable horizontal snap trays on phones for
 * images and 9:16/16:9 scene clips, and a structured multi-column grid on desktop, with filter
 * pills when both media types exist.
 */
export function CreateGallery({
  mediaBase,
  images,
  scenes,
  videoFormat = 'vertical',
}: {
  mediaBase: string;
  images: CreateGalleryImage[];
  scenes: CreateGalleryScene[];
  /** The video's shape: vertical clips are 9:16, horizontal ones 16:9. */
  videoFormat?: 'vertical' | 'horizontal';
}): React.ReactElement | null {
  const t = useTranslations('AdStudio.gallery');
  const tWorkspace = useTranslations('AdStudio.stepWorkspace');
  const [filter, setFilter] = React.useState<GalleryFilter>('all');

  if (images.length === 0 && scenes.length === 0) return null;

  const showFilter = images.length > 0 && scenes.length > 0;
  const showImages = images.length > 0 && (filter === 'all' || filter === 'images');
  const showScenes = scenes.length > 0 && (filter === 'all' || filter === 'scenes');

  const StatusIcon = ({ status }: { status: 'generating' | 'ready' | 'failed' }) =>
    status === 'ready' ? (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
    ) : status === 'failed' ? (
      <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-pp-primary" aria-hidden="true" />
    );

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-pp-outline-variant/40 bg-card p-4 shadow-pp-candy sm:p-5"
      aria-labelledby="ad-studio-gallery-heading"
      data-testid="ad-studio-create-gallery"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id="ad-studio-gallery-heading" className="font-pp-display text-base font-bold sm:text-lg">
          {t('title')}
        </h2>
        {showFilter ? (
          <div
            role="group"
            aria-label={tWorkspace('galleryFilterLabel')}
            className="flex items-center gap-1 rounded-full border border-pp-outline-variant/40 bg-pp-surface-container-low p-1"
          >
            {(
              [
                { key: 'all', label: tWorkspace('filterAll', { count: images.length + scenes.length }) },
                { key: 'images', label: tWorkspace('filterImages', { count: images.length }) },
                { key: 'scenes', label: tWorkspace('filterScenes', { count: scenes.length }) },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={filter === option.key}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  filter === option.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showImages ? (
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5 text-pp-primary" aria-hidden="true" />
            <span>{tWorkspace('imagesCount', { count: images.length })}</span>
          </p>
          <ul className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
            {images.map((image) => (
              <li
                key={image.id}
                className="flex shrink-0 snap-start flex-col gap-1.5"
                data-testid="ad-studio-gallery-image"
              >
                <span
                  className={cn(
                    'relative flex h-44 max-w-full items-center justify-center overflow-hidden rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low sm:h-48',
                    IMAGE_ASPECT[image.format],
                  )}
                >
                  {image.status === 'ready' ? (
                    // A plain img: private media served by our own authenticated route.
                    <img src={`${mediaBase}/images/${image.id}/media`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-2 text-center text-xs text-muted-foreground">{t(`status.${image.status}`)}</span>
                  )}
                </span>
                {/* w-0 + min-w-full: the caption takes the image width instead of widening the tile. */}
                <span className="flex w-0 min-w-full items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusIcon status={image.status} />
                  <span className="truncate font-medium text-foreground/85">{image.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showScenes ? (
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Film className="h-3.5 w-3.5 text-pp-primary" aria-hidden="true" />
            <span>{tWorkspace('scenesCount', { count: scenes.length })}</span>
          </p>
          <ul
            className={cn(
              'flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:overflow-visible sm:pb-0',
              videoFormat === 'vertical' ? 'sm:grid-cols-3 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {scenes.map((scene) => (
              <li
                key={scene.id}
                className={cn(
                  'flex shrink-0 snap-start flex-col gap-1.5 sm:shrink',
                  videoFormat === 'vertical' ? 'w-[144px] sm:w-auto' : 'w-[240px] sm:w-auto',
                )}
                data-testid="ad-studio-gallery-scene"
              >
                <span
                  className={cn(
                    'relative flex items-center justify-center overflow-hidden rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low',
                    videoFormat === 'vertical' ? 'aspect-[9/16]' : 'aspect-video',
                  )}
                >
                  {scene.clip?.status === 'ready' ? (
                    <video
                      src={withFirstFrame(`${mediaBase}/clips/${scene.clip.id}/media`)}
                      muted
                      playsInline
                      preload="metadata"
                      controls
                      className="h-full w-full bg-black object-cover"
                    />
                  ) : (
                    <Clapperboard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {scene.clip ? <StatusIcon status={scene.clip.status} /> : null}
                  <span className="truncate font-medium text-foreground/85">
                    {t('scene', { number: scene.number })} · {t(`status.${scene.clip?.status ?? 'waiting'}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

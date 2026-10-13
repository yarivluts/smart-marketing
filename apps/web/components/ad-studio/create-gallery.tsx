'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clapperboard, Loader2, XCircle } from 'lucide-react';
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

/**
 * What the Create step has made so far: every image as it is drawn and every scene's clip as it
 * renders, so the person watches the ads appear instead of reading a checklist. Read-only; editing
 * happens in Review.
 */
const IMAGE_ASPECT: Record<CreateGalleryImage['format'], string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16]',
  landscape: 'aspect-video',
};

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
  if (images.length === 0 && scenes.length === 0) return null;
  const StatusIcon = ({ status }: { status: 'generating' | 'ready' | 'failed' }) =>
    status === 'ready' ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
    ) : status === 'failed' ? (
      <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
    );

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="ad-studio-gallery-heading" data-testid="ad-studio-create-gallery">
      <h2 id="ad-studio-gallery-heading" className="font-pp-display text-lg font-semibold">
        {t('title')}
      </h2>
      {images.length ? (
        // Rows of one height, each image as wide as its own shape: nothing is cropped or boxed, and no column is left empty.
        <ul className="flex flex-wrap gap-3">
          {images.map((image) => (
            <li key={image.id} className="flex max-w-full flex-col gap-1" data-testid="ad-studio-gallery-image">
              <span className={cn('relative flex h-36 max-w-full items-center justify-center overflow-hidden rounded-2xl bg-muted sm:h-44', IMAGE_ASPECT[image.format])}>
                {image.status === 'ready' ? (
                  // A plain img: private media served by our own authenticated route.
                  <img src={`${mediaBase}/images/${image.id}/media`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t(`status.${image.status}`)}</span>
                )}
              </span>
              {/* w-0 + min-w-full: the caption takes the image width instead of widening the tile. */}
              <span className="flex w-0 min-w-full items-center gap-1 text-xs text-muted-foreground">
                <StatusIcon status={image.status} />
                <span className="truncate">{image.label}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {scenes.length ? (
        <ul className={cn('grid gap-3', videoFormat === 'vertical' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
          {scenes.map((scene) => (
            <li key={scene.id} className="flex flex-col gap-1" data-testid="ad-studio-gallery-scene">
              <span className={cn('relative flex items-center justify-center overflow-hidden rounded-2xl bg-muted', videoFormat === 'vertical' ? 'aspect-[9/16]' : 'aspect-video')}>
                {scene.clip?.status === 'ready' ? (
                  <video src={withFirstFrame(`${mediaBase}/clips/${scene.clip.id}/media`)} muted playsInline preload="metadata" controls className="h-full w-full object-contain" />
                ) : (
                  <Clapperboard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {scene.clip ? <StatusIcon status={scene.clip.status} /> : null}
                {t('scene', { number: scene.number })} · {t(`status.${scene.clip?.status ?? 'waiting'}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

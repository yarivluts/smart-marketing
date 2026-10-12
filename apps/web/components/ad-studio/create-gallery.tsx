'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clapperboard, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { withFirstFrame } from './media-src';

export interface CreateGalleryImage {
  id: string;
  label: string;
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
export function CreateGallery({ mediaBase, images, scenes }: { mediaBase: string; images: CreateGalleryImage[]; scenes: CreateGalleryScene[] }): React.ReactElement | null {
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
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-gallery-heading" data-testid="ad-studio-create-gallery">
      <h2 id="ad-studio-gallery-heading" className="text-base font-semibold">
        {t('title')}
      </h2>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li key={image.id} className="flex flex-col gap-1" data-testid="ad-studio-gallery-image">
              <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
                {image.status === 'ready' ? (
                  // A plain img: private media served by our own authenticated route.
                  <img src={`${mediaBase}/images/${image.id}/media`} alt={image.label} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t(`status.${image.status}`)}</span>
                )}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <StatusIcon status={image.status} />
                <span className="truncate">{image.label}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {scenes.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {scenes.map((scene) => (
            <li key={scene.id} className="flex flex-col gap-1" data-testid="ad-studio-gallery-scene">
              <span className={cn('relative flex aspect-[9/16] max-h-64 items-center justify-center overflow-hidden rounded-xl bg-muted')}>
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

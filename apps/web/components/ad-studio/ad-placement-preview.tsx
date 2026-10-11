'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Play, Send, ThumbsUp } from 'lucide-react';
import type { AdStudioAdCopy, AdStudioImageFormat } from '@growthos/shared';
import { cn } from '@/lib/utils';

/** Where the ad will run; each is drawn the way the platform shows a sponsored post. */
export type AdPlacement =
  'facebook_feed' | 'instagram_feed' | 'instagram_story' | 'google_display' | 'youtube';

export const IMAGE_PLACEMENTS: readonly AdPlacement[] = [
  'facebook_feed',
  'instagram_feed',
  'instagram_story',
  'google_display',
];
export const VIDEO_PLACEMENTS: readonly AdPlacement[] = [
  'facebook_feed',
  'instagram_story',
  'youtube',
];

/** The image formats each placement prefers, best first (KAN-278 previews). */
const IMAGE_FORMAT_PREFERENCE: Record<AdPlacement, AdStudioImageFormat[]> = {
  facebook_feed: ['portrait', 'square', 'landscape', 'story'],
  instagram_feed: ['portrait', 'square', 'story', 'landscape'],
  instagram_story: ['story', 'portrait', 'square', 'landscape'],
  google_display: ['landscape', 'square', 'portrait', 'story'],
  youtube: ['landscape', 'square', 'portrait', 'story'],
};

export type AdPreviewMedia =
  | { kind: 'image'; byFormat: Partial<Record<AdStudioImageFormat, string>>; alt: string }
  | { kind: 'video'; src: string; vertical: boolean; label: string; testId?: string };

export interface AdPlacementPreviewProps {
  copy: AdStudioAdCopy | null;
  media: AdPreviewMedia | null;
  advertiser: string;
  /** The landing page, shown as its domain the way the platforms do. */
  linkUrl: string | null;
  placements?: readonly AdPlacement[];
}

function domainOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The best image for a placement, and whether it is that placement's own format. */
export function imageForPlacement(
  byFormat: Partial<Record<AdStudioImageFormat, string>>,
  placement: AdPlacement,
): { src: string; format: AdStudioImageFormat; exact: boolean } | null {
  const preference = IMAGE_FORMAT_PREFERENCE[placement];
  const format = preference.find((candidate) => byFormat[candidate]);
  return format
    ? {
        src: byFormat[format] as string,
        format,
        exact:
          format === preference[0] || (placement !== 'instagram_story' && format === preference[1]),
      }
    : null;
}

const ASPECT: Record<AdStudioImageFormat, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16]',
  landscape: 'aspect-[1.91/1]',
};

function Avatar({ name, className }: { name: string; className?: string }): React.ReactElement {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary',
        className,
      )}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

/**
 * How an ad will look where it runs (KAN-278): a Facebook post, an Instagram post or story, a Google
 * display ad or a YouTube ad, drawn from the creative and its copy. A mock-up, not the platform's own
 * renderer: proportions and text placement follow each platform's layout so a person can judge
 * whether the message reads before publishing.
 */
export function AdPlacementPreview({
  copy,
  media,
  advertiser,
  linkUrl,
  placements,
}: AdPlacementPreviewProps): React.ReactElement {
  const t = useTranslations('AdStudio.preview');
  const options = placements ?? (media?.kind === 'video' ? VIDEO_PLACEMENTS : IMAGE_PLACEMENTS);
  const [placement, setPlacement] = React.useState<AdPlacement>(options[0]);
  const domain = domainOf(linkUrl);
  const headline = copy?.headline || t('noHeadline');
  const primary = copy?.primaryText || '';
  const description = copy?.description || '';
  const cta = t('cta');

  const visual = (format: 'feed' | 'story' | 'wide'): React.ReactNode => {
    if (!media)
      return (
        <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
          {t('noMedia')}
        </div>
      );
    if (media.kind === 'video') {
      return (
        <video
          src={media.src}
          controls
          playsInline
          preload="metadata"
          aria-label={media.label}
          data-testid={media.testId}
          className={cn(
            'w-full bg-black object-contain',
            format === 'story' ? 'aspect-[9/16]' : media.vertical ? 'aspect-[4/5]' : 'aspect-video',
          )}
        />
      );
    }
    const image = imageForPlacement(media.byFormat, placement);
    if (!image)
      return (
        <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
          {t('noMedia')}
        </div>
      );
    return (
      <img
        src={image.src}
        alt={media.alt}
        className={cn(
          'w-full bg-muted object-cover',
          format === 'story' ? 'aspect-[9/16]' : ASPECT[image.format],
        )}
      />
    );
  };
  // Said under the mock-up, not on it: an overlay would hide the copy and the button it is about.
  const borrowed =
    media?.kind === 'image' ? imageForPlacement(media.byFormat, placement) : null;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="ad-placement-preview"
      data-placement={placement}
    >
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('placementsLabel')}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={placement === option}
            onClick={() => setPlacement(option)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              placement === option
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`placement.${option}`)}
          </button>
        ))}
      </div>

      <div className="mx-auto w-full max-w-sm" role="tabpanel">
        {placement === 'facebook_feed' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm">
            <div className="flex items-center gap-2 px-3 pt-3">
              <Avatar name={advertiser} className="h-9 w-9 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-semibold" dir="auto">
                  {advertiser}
                </span>
                <span className="text-[11px] text-muted-foreground">{t('sponsored')}</span>
              </div>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            {primary ? (
              <p className="whitespace-pre-line px-3 py-2 text-sm" dir="auto">
                {primary}
              </p>
            ) : null}
            {visual('feed')}
            <div className="flex items-center justify-between gap-3 bg-muted/60 px-3 py-2">
              <div className="flex min-w-0 flex-col">
                {domain ? (
                  <span className="truncate text-[11px] uppercase text-muted-foreground">
                    {domain}
                  </span>
                ) : null}
                <span className="truncate text-sm font-semibold" dir="auto">
                  {headline}
                </span>
                {description ? (
                  <span className="truncate text-xs text-muted-foreground" dir="auto">
                    {description}
                  </span>
                ) : null}
              </div>
              <span className="shrink-0 rounded-md bg-muted px-3 py-1.5 text-xs font-semibold">
                {cta}
              </span>
            </div>
            <div
              className="flex justify-around border-t border-border py-2 text-xs text-muted-foreground"
              aria-hidden="true"
            >
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="h-3.5 w-3.5" /> {t('like')}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" /> {t('comment')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Send className="h-3.5 w-3.5" /> {t('share')}
              </span>
            </div>
          </div>
        ) : null}

        {placement === 'instagram_feed' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm">
            <div className="flex items-center gap-2 px-3 py-2">
              <Avatar name={advertiser} className="h-8 w-8 text-xs ring-2 ring-pink-500/60" />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-xs font-semibold" dir="auto">
                  {advertiser}
                </span>
                <span className="text-[10px] text-muted-foreground">{t('sponsored')}</span>
              </div>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            {visual('feed')}
            <div className="flex items-center justify-between bg-primary/90 px-3 py-2 text-xs font-semibold text-primary-foreground">
              <span>{cta}</span>
              <span aria-hidden="true">›</span>
            </div>
            <div className="flex gap-3 px-3 pt-2 text-foreground" aria-hidden="true">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
              <Bookmark className="ms-auto h-5 w-5" />
            </div>
            <p className="px-3 pb-3 pt-1 text-xs" dir="auto">
              <span className="font-semibold">{advertiser}</span> {primary || headline}
            </p>
          </div>
        ) : null}

        {placement === 'instagram_story' ? (
          <div className="relative mx-auto w-64 overflow-hidden rounded-2xl bg-black shadow-lg">
            {visual('story')}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 text-white">
              <span className="h-0.5 w-full rounded bg-white/60" aria-hidden="true" />
              <span className="flex items-center gap-2 text-xs font-semibold">
                <Avatar name={advertiser} className="h-6 w-6 text-[10px]" />
                <span className="truncate" dir="auto">
                  {advertiser}
                </span>
                <span className="text-[10px] font-normal opacity-80">{t('sponsored')}</span>
              </span>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-10 text-center text-white">
              {primary || copy?.headline ? (
                <p className="text-xs leading-snug" dir="auto">
                  {primary || copy?.headline}
                </p>
              ) : null}
              <span className="rounded-full bg-white px-4 py-1 text-xs font-semibold text-black">
                {cta}
              </span>
            </div>
          </div>
        ) : null}

        {placement === 'google_display' ? (
          <div className="overflow-hidden rounded-md border border-border bg-background text-foreground shadow-sm">
            {visual('wide')}
            <div className="flex flex-col gap-1 p-3">
              <span
                className="text-base font-semibold leading-snug text-[#1a0dab] dark:text-[#8ab4f8]"
                dir="auto"
              >
                {copy?.primaryText || headline}
              </span>
              {description ? (
                <span className="text-xs text-muted-foreground" dir="auto">
                  {description}
                </span>
              ) : null}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded border border-border px-1 text-[9px] font-semibold">
                    {t('adBadge')}
                  </span>
                  <span className="truncate" dir="auto">
                    {advertiser}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#1a73e8] px-3 py-1 text-xs font-semibold text-white">
                  {cta}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {placement === 'youtube' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm">
            <div className="relative">
              {visual('wide')}
              <span className="pointer-events-none absolute bottom-2 end-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
                {t('skipAd')}
              </span>
              {media?.kind !== 'video' ? (
                <Play
                  className="pointer-events-none absolute inset-0 m-auto h-10 w-10 text-white/90"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <Avatar name={advertiser} className="h-8 w-8 text-xs" />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-semibold" dir="auto">
                  {headline}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  <span className="font-semibold">{t('adBadge')}</span> · {domain || advertiser}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-[#065fd4] px-3 py-1.5 text-xs font-semibold text-white">
                {cta}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {borrowed && !borrowed.exact ? (
        <p
          className="rounded-md bg-warning/10 px-2 py-1 text-center text-[11px] text-warning"
          data-testid="ad-preview-format-note"
        >
          {t('formatFallback', { format: borrowed.format })}
        </p>
      ) : null}
      <p className="text-center text-[10px] text-muted-foreground">{t('mockupNote')}</p>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ChevronLeft, Clapperboard, ImageIcon, Images, Loader2, Search, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { CreativeState, ImageCreativeSummary, SearchCreativeSummary, VideoCreativeSummary } from '@/lib/ad-studio/review-overview';
import { withFirstFrame } from './media-src';

const STATE_TONE: Record<CreativeState, string> = {
  ready: 'bg-success/10 text-success',
  attention: 'bg-warning/15 text-warning',
  working: 'bg-primary/10 text-primary',
  empty: 'bg-muted text-muted-foreground',
};

const PREVIEW_ASPECT = { square: 'aspect-square', portrait: 'aspect-[4/5]', story: 'aspect-[9/16]', landscape: 'aspect-video' } as const;

function StateBadge({ state }: { state: CreativeState }): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const Icon = state === 'ready' ? CheckCircle2 : state === 'attention' ? AlertTriangle : state === 'working' ? Loader2 : null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATE_TONE[state])} data-testid="ad-studio-creative-state">
      {Icon ? <Icon className={cn('h-3.5 w-3.5', state === 'working' && 'animate-spin')} aria-hidden="true" /> : null}
      {t(`state.${state}`)}
    </span>
  );
}

/** One creative as a card: a preview, where it stands, the few facts that matter, and the whole card opens it. */
function CreativeCard({
  href,
  title,
  subtitle,
  state,
  preview,
  facts,
  testId,
}: {
  href: string;
  title: string;
  subtitle?: string;
  state: CreativeState;
  preview: React.ReactNode;
  facts: React.ReactNode;
  testId: string;
}): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        data-testid={testId}
      >
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">{preview}</div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="font-pp-display text-base font-semibold">{title}</span>
              {subtitle ? (
                <span className="truncate text-xs text-muted-foreground" dir="auto">
                  {subtitle}
                </span>
              ) : null}
            </div>
            <StateBadge state={state} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">{facts}</div>
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary">
            {t('open')}
            <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function EmptyPreview({ icon: Icon }: { icon: typeof ImageIcon }): React.ReactElement {
  return <Icon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />;
}

export interface ReviewOverviewProps {
  mediaBase: string;
  /** Where each card and action leads: the image idea's detail by concept id, all ideas, the video, the search ad. */
  hrefs: { image: Record<string, string>; images: string; video: string; search: string };
  images: ImageCreativeSummary[];
  video: VideoCreativeSummary;
  search: SearchCreativeSummary;
  videoFormat: 'vertical' | 'horizontal';
}

/**
 * The Review step's first screen: every creative of the ad as a card - each image idea, the video,
 * the search ad - with a preview, where it stands and what is missing. A card opens the creative's
 * own page, where all of it is shown and edited. Work on all ideas at once (new ideas with AI, add an
 * idea) lives on the image ideas page.
 */
export function ReviewOverview({ mediaBase, hrefs, images, video, search, videoFormat }: ReviewOverviewProps): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const tf = useTranslations('AdStudio.images.format');
  const counts = [...images.map((image) => image.state), video.state, search.state];
  return (
    <section className="flex flex-col gap-5" aria-labelledby="ad-studio-review-overview-heading" data-testid="ad-studio-review-overview">
      <header className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="ad-studio-review-overview-heading" className="font-pp-display text-xl font-semibold tracking-tight">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
          <p className="flex flex-wrap gap-2 pt-1 text-xs" data-testid="ad-studio-review-counts">
            {(['ready', 'attention', 'working'] as const).map((state) => {
              const count = counts.filter((value) => value === state).length;
              return count ? (
                <span key={state} className={cn('rounded-full px-2.5 py-0.5 font-semibold', STATE_TONE[state])}>
                  {t(`count.${state}`, { count })}
                </span>
              ) : null;
            })}
          </p>
        </div>
        <Link
          href={hrefs.images}
          className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15 sm:self-auto"
          data-testid="ad-studio-review-manage-ideas"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t('manageIdeas')}
        </Link>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => (
          <CreativeCard
            key={image.conceptId}
            href={hrefs.image[image.conceptId]}
            testId={`ad-studio-creative-image-${image.index}`}
            title={t('imageTitle', { index: image.index })}
            subtitle={image.headline || undefined}
            state={image.state}
            preview={
              image.preview ? (
                // A plain img: private media from our own authenticated route.
                <img src={`${mediaBase}/images/${image.preview.imageId}/media`} alt={t('imageTitle', { index: image.index })} className={cn('h-full max-w-full object-contain', PREVIEW_ASPECT[image.preview.format])} />
              ) : (
                <EmptyPreview icon={ImageIcon} />
              )
            }
            facts={
              <>
                <span className="flex flex-wrap gap-1">
                  {image.placements.map((placement) => (
                    <span key={placement.format} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATE_TONE[placement.state])}>
                      {tf(placement.format)}
                    </span>
                  ))}
                </span>
                <span>{image.hasCopy ? t('copyReady') : t('copyMissing')}</span>
              </>
            }
          />
        ))}
        {images.length === 0 ? (
          <CreativeCard
            href={hrefs.images}
            testId="ad-studio-creative-images-empty"
            title={t('imagesEmptyTitle')}
            state="empty"
            preview={<EmptyPreview icon={Images} />}
            facts={<span>{t('imagesEmpty')}</span>}
          />
        ) : null}
        <CreativeCard
          href={hrefs.video}
          testId="ad-studio-creative-video"
          title={t('videoTitle')}
          state={video.state}
          preview={
            video.previewClipId ? (
              <video
                src={withFirstFrame(`${mediaBase}/clips/${video.previewClipId}/media`)}
                muted
                playsInline
                preload="metadata"
                className={cn('h-full max-w-full object-contain', videoFormat === 'vertical' ? 'aspect-[9/16]' : 'aspect-video')}
              />
            ) : (
              <EmptyPreview icon={Clapperboard} />
            )
          }
          facts={
            <>
              <span>{video.scenes ? t('videoScenes', { rendered: video.rendered, scenes: video.scenes }) : t('videoNoScript')}</span>
              {video.assembled ? <span>{t('videoAssembled', { seconds: video.assembledSeconds })}</span> : null}
              {video.scenes ? <span>{video.hasCopy ? t('copyReady') : t('copyMissing')}</span> : null}
            </>
          }
        />
        <CreativeCard
          href={hrefs.search}
          testId="ad-studio-creative-search"
          title={t('searchTitle')}
          state={search.state}
          preview={
            search.sample ? (
              <div className="flex w-full flex-col gap-1 p-6 text-start">
                <span className="text-[11px] font-semibold text-foreground">{t('searchSponsored')}</span>
                <span className="text-lg font-medium text-primary" dir="auto">
                  {search.sample}
                </span>
              </div>
            ) : (
              <EmptyPreview icon={Search} />
            )
          }
          facts={
            <>
              <span>{t('searchCounts', { headlines: search.headlines, descriptions: search.descriptions })}</span>
              <span>{t('searchKeywords', { count: search.keywords })}</span>
            </>
          }
        />
      </ul>
    </section>
  );
}

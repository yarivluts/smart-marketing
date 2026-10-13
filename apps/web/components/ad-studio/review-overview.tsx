'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ChevronLeft, CircleDashed, Clapperboard, ImageIcon, Images, Loader2, Play, Search, Sparkles, Wand2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  reviewHasWorkInProgress,
  reviewNextStep,
  videoNeedsAssembly,
  type CreativeState,
  type ImageCreativeSummary,
  type ReviewItem,
  type ReviewNextStep,
  type SearchCreativeSummary,
  type VideoCreativeSummary,
} from '@/lib/ad-studio/review-overview';
import { withFirstFrame } from './media-src';

const STATE_TONE: Record<CreativeState, string> = {
  ready: 'bg-success/10 text-success',
  attention: 'bg-warning/15 text-warning',
  working: 'bg-primary/10 text-primary',
  empty: 'bg-muted text-muted-foreground',
};

const STATE_DOT: Record<CreativeState, string> = {
  ready: 'bg-success',
  attention: 'bg-warning',
  working: 'bg-primary',
  empty: 'bg-muted-foreground/40',
};

/** How often the overview checks on work in progress. */
export const REVIEW_POLL_MS = 8000;

const PREVIEW_ASPECT = { square: 'aspect-square', portrait: 'aspect-[4/5]', story: 'aspect-[9/16]', landscape: 'aspect-video' } as const;

function StateBadge({ state }: { state: CreativeState }): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const Icon = state === 'ready' ? CheckCircle2 : state === 'attention' ? AlertTriangle : state === 'working' ? Loader2 : CircleDashed;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATE_TONE[state])} data-testid="ad-studio-creative-state">
      <Icon className={cn('h-3.5 w-3.5', state === 'working' && 'animate-spin')} aria-hidden="true" />
      {t(`state.${state}`)}
    </span>
  );
}

/** A fact line under a card's preview, marked done or not. */
function Fact({ done, children, strong }: { done?: boolean; strong?: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <span className={cn('flex items-center gap-1.5', strong && 'font-semibold text-foreground')}>
      {done === undefined ? null : done ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

/**
 * One creative as a card: its name and where it stands on top, the preview shown whole on a soft
 * backdrop, the few facts that matter, and the whole card opens the creative's own page.
 */
function CreativeCard({
  href,
  title,
  subtitle,
  state,
  preview,
  facts,
  testId,
  highlight,
  span,
  fluidPreview,
}: {
  href: string;
  title: string;
  subtitle?: string;
  state: CreativeState;
  preview: React.ReactNode;
  facts: React.ReactNode;
  testId: string;
  /** The card the next-step banner points at. */
  highlight?: 'attention' | 'action';
  /** Grid span classes: the last card stretches over the rest of its row. */
  span?: string;
  /** The preview grows with the card instead of keeping a 4:3 box (a text preview on a wide card). */
  fluidPreview?: boolean;
}): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  return (
    <li className={cn('min-w-0', span)}>
      <Link
        href={href}
        className={cn(
          'group flex h-full flex-col gap-3 rounded-3xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
          highlight === 'action' ? 'border-primary/50 ring-2 ring-primary/20' : highlight === 'attention' ? 'border-warning/60 ring-2 ring-warning/20' : 'border-border/60',
        )}
        data-testid={testId}
        data-highlight={highlight}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', STATE_DOT[state])} aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="font-pp-display text-base font-semibold leading-tight">{title}</span>
              {subtitle ? (
                <span className="truncate text-xs text-muted-foreground" dir="auto">
                  {subtitle}
                </span>
              ) : null}
            </div>
          </div>
          <StateBadge state={state} />
        </div>
        <div className={cn('relative flex items-center justify-center overflow-hidden rounded-2xl bg-muted/70', fluidPreview ? 'min-h-40 flex-1' : 'aspect-[4/3]')}>{preview}</div>
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">{facts}</div>
        <span className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-xs font-semibold text-primary">
          {t('open')}
          <ChevronLeft className="h-4 w-4 transition group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/** The search card comes after the image cards and the video: it takes the rest of its row. */
function searchSpan(cardsBefore: number): string {
  const sm = cardsBefore % 2 === 0 ? 'sm:col-span-2' : '';
  const xl = ['xl:col-span-3', 'xl:col-span-2', 'xl:col-span-1'][cardsBefore % 3];
  return cn(sm, xl);
}

function EmptyPreview({ icon: Icon }: { icon: typeof ImageIcon }): React.ReactElement {
  return <Icon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />;
}

/** The banner at the top of the overview: the one thing to do next, with the way to do it. */
function NextStepBanner({
  next,
  hrefFor,
  imagesHref,
  videoHref,
  publishHref,
}: {
  next: ReviewNextStep;
  hrefFor: (item: ReviewItem) => string;
  imagesHref: string;
  videoHref: string;
  publishHref: string | null;
}): React.ReactElement {
  const t = useTranslations('AdStudio.review.next');
  const action =
    next.kind === 'attention'
      ? { href: hrefFor(next.item), label: t('attention.action'), icon: AlertTriangle }
      : next.kind === 'assemble'
        ? { href: videoHref, label: t('assemble.action'), icon: Play }
        : next.kind === 'publish' && publishHref
          ? { href: publishHref, label: t('publish.action'), icon: Sparkles }
          : next.kind === 'start'
            ? { href: imagesHref, label: t('start.action'), icon: Wand2 }
            : null;
  const values: Record<string, number> = next.kind === 'attention' || next.kind === 'working' ? { count: next.count } : next.kind === 'publish' ? { count: next.ready } : {};
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pp-primary to-pp-primary-container p-6 text-white shadow-glow sm:p-8"
      aria-labelledby="ad-studio-next-step-title"
      data-testid="ad-studio-review-next"
      data-next={next.kind}
    >
      <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('eyebrow')}
          </span>
          <h2 id="ad-studio-next-step-title" className="font-pp-display text-2xl font-bold leading-tight tracking-tight [text-wrap:balance] sm:text-3xl">
            {t(`${next.kind}.title`, values)}
          </h2>
          <p className="max-w-2xl text-sm text-white/85">{t(`${next.kind}.description`, values)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {action ? (
            <Link
              href={action.href}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-pp-primary shadow-sm transition hover:bg-white/90"
              data-testid="ad-studio-review-next-action"
            >
              <action.icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </Link>
          ) : null}
          {publishHref && next.kind !== 'publish' ? (
            <Link href={publishHref} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/90 hover:text-white hover:underline" data-testid="ad-studio-review-next-publish">
              {t('continuePublish')}
              <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export interface ReviewOverviewProps {
  mediaBase: string;
  /** Where each card and action leads: the image idea's detail by concept id, all ideas, the video, the search ad. */
  hrefs: { image: Record<string, string>; images: string; video: string; search: string };
  images: ImageCreativeSummary[];
  video: VideoCreativeSummary;
  search: SearchCreativeSummary;
  videoFormat: 'vertical' | 'horizontal';
  /** The ad's writing direction: the search ad preview reads like the ad, not like the page. */
  adDirection?: 'rtl' | 'ltr';
  /** The Publish step, once something can be published; null while it is locked. */
  publishHref?: string | null;
  /** The landing page's host, shown in the search ad preview the way Google shows it. */
  searchHost?: string | null;
}

/**
 * The Review step's first screen: what to do next, then every creative of the ad as a card - each
 * image idea, the video, the search ad - with a preview, where it stands and what is missing. A card
 * opens the creative's own page, where all of it is shown and edited. Work on all ideas at once (new
 * ideas with AI, add an idea) lives on the image ideas page.
 */
export function ReviewOverview({ mediaBase, hrefs, images, video, search, videoFormat, adDirection = 'ltr', publishHref = null, searchHost = null }: ReviewOverviewProps): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const tf = useTranslations('AdStudio.images.format');
  const counts = [...images.map((image) => image.state), video.state, search.state];
  const next = reviewNextStep(images, video, search);
  const router = useRouter();
  const inProgress = reviewHasWorkInProgress(images, video);
  const videoGenerating = video.generating;
  // While an image or a clip is still being made, keep the page current. Clips advance only when
  // their status is asked for, so that is asked first; then the server parts of the page re-render.
  React.useEffect(() => {
    if (!inProgress) return;
    const poll = setInterval(() => {
      void (async () => {
        if (videoGenerating) {
          try {
            await fetch(`${mediaBase}/render-status`, { cache: 'no-store' });
          } catch {
            // The next poll tries again.
          }
        }
        router.refresh();
      })();
    }, REVIEW_POLL_MS);
    return () => clearInterval(poll);
  }, [inProgress, videoGenerating, mediaBase, router]);
  const hrefFor = (item: ReviewItem) => (item.kind === 'image' ? hrefs.image[item.conceptId] : hrefs[item.kind]);
  const highlightOf = (item: ReviewItem): 'attention' | 'action' | undefined => {
    if (next.kind === 'assemble') return item.kind === 'video' ? 'action' : undefined;
    if (next.kind !== 'attention') return undefined;
    const target = next.item;
    return target.kind === item.kind && (target.kind !== 'image' || (item.kind === 'image' && target.conceptId === item.conceptId)) ? 'attention' : undefined;
  };
  return (
    <div className="flex flex-col gap-6" data-testid="ad-studio-review-overview">
      <NextStepBanner next={next} hrefFor={hrefFor} imagesHref={hrefs.images} videoHref={hrefs.video} publishHref={publishHref} />

      <section className="flex flex-col gap-4" aria-labelledby="ad-studio-review-overview-heading">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ad-studio-review-overview-heading" className="font-pp-display text-xl font-semibold tracking-tight">
                {t('title')}
              </h2>
              <p className="flex flex-wrap gap-1.5 text-xs" data-testid="ad-studio-review-counts">
                {(['ready', 'attention', 'working'] as const).map((state) => {
                  const count = counts.filter((value) => value === state).length;
                  return count ? (
                    <span key={state} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold', STATE_TONE[state])}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[state])} aria-hidden="true" />
                      {t(`count.${state}`, { count })}
                    </span>
                  ) : null;
                })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <Link
            href={hrefs.images}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full border border-primary/20 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10 sm:self-auto"
            data-testid="ad-studio-review-manage-ideas"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
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
              highlight={highlightOf({ kind: 'image', conceptId: image.conceptId })}
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
                  <Fact done={image.hasCopy}>{image.hasCopy ? t('copyReady') : t('copyMissing')}</Fact>
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
            subtitle={video.scenes ? t(videoFormat === 'vertical' ? 'videoVertical' : 'videoHorizontal') : undefined}
            state={video.state}
            highlight={highlightOf({ kind: 'video' })}
            preview={
              video.previewClipId ? (
                <>
                  <video
                    src={withFirstFrame(`${mediaBase}/clips/${video.previewClipId}/media`)}
                    muted
                    playsInline
                    preload="metadata"
                    className={cn('h-full max-w-full object-contain', videoFormat === 'vertical' ? 'aspect-[9/16]' : 'aspect-video')}
                  />
                  <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-pp-primary shadow-md" aria-hidden="true">
                    <Play className="h-5 w-5 translate-x-px fill-current" />
                  </span>
                </>
              ) : (
                <EmptyPreview icon={Clapperboard} />
              )
            }
            facts={
              <>
                <Fact done={video.scenes > 0 && video.rendered === video.scenes}>{video.scenes ? t('videoScenes', { rendered: video.rendered, scenes: video.scenes }) : t('videoNoScript')}</Fact>
                {video.assembled ? (
                  <Fact done>{t('videoAssembled', { seconds: video.assembledSeconds })}</Fact>
                ) : videoNeedsAssembly(video) ? (
                  <Fact strong>{t('videoNotAssembled')}</Fact>
                ) : null}
                {video.scenes ? <Fact done={video.hasCopy}>{video.hasCopy ? t('copyReady') : t('copyMissing')}</Fact> : null}
              </>
            }
          />
          <CreativeCard
            href={hrefs.search}
            testId="ad-studio-creative-search"
            title={t('searchTitle')}
            state={search.state}
            highlight={highlightOf({ kind: 'search' })}
            span={searchSpan(Math.max(images.length, 1) + 1)}
            fluidPreview
            preview={
              search.sample ? (
                // Shaped like a Google result: the sponsored label and site, the headlines, the description.
                <div className="m-3 flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border/60 bg-card p-4 text-start shadow-sm" dir={adDirection} data-testid="ad-studio-search-preview">
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-bold text-foreground">{t('searchSponsored')}</span>
                    {searchHost ? (
                      <span dir="ltr" className="truncate">
                        {searchHost}
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-base font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
                    {search.sampleSecond ? `${search.sample} | ${search.sampleSecond}` : search.sample}
                  </span>
                  {search.sampleDescription ? <span className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{search.sampleDescription}</span> : null}
                </div>
              ) : (
                <EmptyPreview icon={Search} />
              )
            }
            facts={
              <>
                <Fact done={search.state === 'ready'}>{t('searchCounts', { headlines: search.headlines, descriptions: search.descriptions })}</Fact>
                <Fact done={search.keywords > 0}>{t('searchKeywords', { count: search.keywords })}</Fact>
              </>
            }
          />
        </ul>
      </section>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AdShareFeedbackItem } from '@growthos/shared';
import { Eye, Film, LinkIcon, Sparkles } from 'lucide-react';
import { formatShareDate, type SharedAdsPage, type SharedImageAd } from '@/lib/ad-studio/share-view';
import { AdPlacementPreview, IMAGE_PLACEMENTS, imageForPlacement, type AdPlacement } from './ad-placement-preview';
import { BrandLogoProvider } from './brand-logo';
import { SearchResultPreview } from './search-result-preview';
import {
  SharedBriefFeedbackBar,
  SharedGeneralRequestSection,
  SharedResultsSection,
} from './shared-ads-feedback';

/** The placements an idea has its own image for; every image placement when it has none exactly. */
export function sharedImagePlacements(byFormat: SharedImageAd['byFormat']): readonly AdPlacement[] {
  const exact = IMAGE_PLACEMENTS.filter((placement) => imageForPlacement(byFormat, placement)?.exact);
  return exact.length ? exact : IMAGE_PLACEMENTS;
}

/**
 * What the client sees through a share link: the brand, then each shared ad's finished image ideas
 * and video, drawn in the platform mock-ups with their copy. Read-only - no studio controls.
 */
export function SharedAdsView({ page }: { page: SharedAdsPage }): React.ReactElement {
  const t = useTranslations('AdShare.public');
  const tf = useTranslations('AdStudio.images.format');
  const locale = useLocale();
  const [feedback, setFeedback] = useState<AdShareFeedbackItem[]>(() => page.feedback ?? []);
  const allowFeedback = Boolean(page.allowFeedback && page.token);
  function appendFeedback(item: AdShareFeedbackItem): void {
    setFeedback((prev) => (prev.some((existing) => existing.id === item.id) ? prev : [...prev, item]));
  }
  const brand = page.brandName.trim();
  const isPrePublishView = Boolean(page.includeDrafts || page.includeResults === false);
  const hasCampaignDrafts = Boolean(page.campaignDrafts && page.campaignDrafts.length > 0);

  return (
    <BrandLogoProvider url={page.logoSrc}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6" data-testid="shared-ads">
        <header className="flex flex-col items-center gap-3 text-center">
          {page.logoSrc ? <img src={page.logoSrc} alt={brand || t('logoAlt')} className="h-16 w-16 rounded-full bg-white object-contain shadow-sm" /> : null}
          <h1 className="text-2xl font-bold sm:text-3xl" dir="auto">
            {brand ? t('titleWithBrand', { brand }) : t('title')}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">{t('intro')}</p>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {t('viewOnly', { date: formatShareDate(locale, page.expiresOn) })}
          </p>
          {isPrePublishView ? (
            <div
              className="flex max-w-2xl flex-col items-center gap-1 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs"
              data-testid="shared-ads-prepublish-banner"
            >
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t('prePublishBannerTitle')}
              </span>
              <p className="text-muted-foreground">{t('prePublishBannerBody')}</p>
            </div>
          ) : null}
          {(page.revisionNumber ?? 1) > 1 || page.revisionNote ? (
            <p
              className="inline-flex flex-wrap items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              data-testid="shared-ads-revision"
            >
              <span>{t('revisionBadge', { revision: page.revisionNumber ?? 1 })}</span>
              {page.revisionNote ? <span className="text-foreground/80">· {page.revisionNote}</span> : null}
            </p>
          ) : null}
        </header>

        {page.includeResults && page.results ? (
          <SharedResultsSection
            results={page.results}
            allowFeedback={allowFeedback}
            token={page.token}
            feedback={feedback}
            onSubmitted={appendFeedback}
          />
        ) : null}

        {page.briefs.length === 0 && !(page.includeResults && page.results) && !hasCampaignDrafts ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="shared-ads-empty">
            {t('empty')}
          </p>
        ) : (
          page.briefs.map((brief) => (
            <section key={brief.id} className="flex flex-col gap-4" aria-labelledby={`shared-brief-${brief.id}`} data-testid="shared-brief">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <h2 id={`shared-brief-${brief.id}`} className="text-lg font-semibold" dir="auto">
                  {brief.name}
                </h2>
                {brief.isPrePublishDraft || isPrePublishView ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
                    data-testid="shared-brief-prepublish-badge"
                  >
                    {t('prePublishBadge')}
                  </span>
                ) : null}
              </div>

              {brief.draftMeta ? (
                <div
                  className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/35 p-4 text-xs"
                  data-testid="shared-brief-meta"
                  dir="auto"
                >
                  {brief.draftMeta.objective ? (
                    <p>
                      <span className="font-semibold text-foreground">{t('metaObjectiveLabel')} </span>
                      <span className="text-muted-foreground">{brief.draftMeta.objective}</span>
                    </p>
                  ) : null}
                  {brief.draftMeta.productDescription ? (
                    <p className="text-muted-foreground">{brief.draftMeta.productDescription}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {brief.draftMeta.audienceSummary ? (
                      <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium text-foreground">
                        {t('metaAudienceLabel')} {brief.draftMeta.audienceSummary}
                      </span>
                    ) : null}
                    {brief.draftMeta.keywords.length > 0 ? (
                      <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium text-foreground">
                        {t('metaKeywordsLabel')} {brief.draftMeta.keywords.slice(0, 6).join(', ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {brief.video || brief.images.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {brief.video ? (
                    <article className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="shared-video">
                      <h3 className="text-sm font-semibold">{t('video', { seconds: Math.round(brief.video.durationSeconds) })}</h3>
                      <AdPlacementPreview
                        copy={brief.video.copy}
                        media={{ kind: 'video', src: brief.video.src, vertical: brief.video.vertical, label: t('videoLabel', { name: brief.name }) }}
                        advertiser={brand || brief.name}
                        linkUrl={brief.landingPageUrl}
                      />
                    </article>
                  ) : null}
                  {brief.images.map((idea) =>
                    Object.keys(idea.byFormat).length > 0 ? (
                      <article key={idea.conceptId} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="shared-image">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{t('idea', { index: idea.index })}</h3>
                          {idea.isDraft ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t('draftVersionBadge')}
                            </span>
                          ) : null}
                        </div>
                        <AdPlacementPreview
                          copy={idea.copy}
                          media={{ kind: 'image', byFormat: idea.byFormat, alt: idea.copy?.headline || t('idea', { index: idea.index }) }}
                          advertiser={brand || brief.name}
                          linkUrl={brief.landingPageUrl}
                          placements={sharedImagePlacements(idea.byFormat)}
                        />
                      </article>
                    ) : (
                      <article key={idea.conceptId} className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-primary/35 bg-card p-4 shadow-sm" data-testid="shared-image-draft" dir="auto">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{t('idea', { index: idea.index })}</h3>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {t('conceptPreviewBadge')}
                          </span>
                        </div>
                        {idea.headline || idea.copy?.headline ? (
                          <p className="text-sm font-bold text-foreground">{idea.headline || idea.copy?.headline}</p>
                        ) : null}
                        {idea.copy?.primaryText ? <p className="text-xs leading-relaxed text-foreground/90">{idea.copy.primaryText}</p> : null}
                        {idea.visualPrompt ? (
                          <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">{t('plannedVisualLabel')} </span>
                            {idea.visualPrompt}
                          </p>
                        ) : null}
                        {idea.plannedFormats && idea.plannedFormats.length > 0 ? (
                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                            <span>{t('plannedFormatsLabel')}</span>
                            {idea.plannedFormats.map((fmt) => (
                              <span key={fmt} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                                {tf(fmt)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ),
                  )}
                </div>
              ) : null}

              {brief.scenes && brief.scenes.length > 0 ? (
                <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="shared-video-storyboard" dir="auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <Film className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold">{t('storyboardHeading', { count: brief.scenes.length })}</h3>
                  </div>
                  {brief.videoCopyDraft && (brief.videoCopyDraft.headline || brief.videoCopyDraft.primaryText) ? (
                    <div className="rounded-xl bg-muted/40 p-3 text-xs">
                      {brief.videoCopyDraft.headline ? <p className="font-semibold text-foreground">{brief.videoCopyDraft.headline}</p> : null}
                      {brief.videoCopyDraft.primaryText ? <p className="mt-0.5 text-muted-foreground">{brief.videoCopyDraft.primaryText}</p> : null}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {brief.scenes.map((scene) => (
                      <article key={scene.id} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs" data-testid="shared-scene-card">
                        <span className="font-semibold text-foreground">{t('sceneHeading', { index: scene.index, seconds: Math.round(scene.durationSeconds) })}</span>
                        {scene.clipSrc ? (
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={scene.clipSrc}
                            aria-label={t('sceneVideoLabel', { index: scene.index })}
                            className="aspect-video w-full rounded-lg bg-black object-contain"
                          />
                        ) : null}
                        {scene.narration ? (
                          <p className="text-foreground/90">
                            <span className="font-semibold text-foreground">{t('sceneNarrationLabel')} </span>
                            {scene.narration}
                          </p>
                        ) : null}
                        {scene.onScreenText ? (
                          <p className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{t('sceneOverlayLabel')} </span>
                            {scene.onScreenText}
                          </p>
                        ) : null}
                        {!scene.clipSrc && scene.visualPrompt ? (
                          <p className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{t('sceneVisualLabel')} </span>
                            {scene.visualPrompt}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {brief.searchAd ? (
                <article
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm"
                  data-testid="shared-search-ad"
                >
                  <h3 className="text-sm font-semibold">{t('searchAdHeading')}</h3>
                  <SearchResultPreview
                    headlines={brief.searchAd.headlines}
                    descriptions={brief.searchAd.descriptions}
                    path1={brief.searchAd.path1}
                    path2={brief.searchAd.path2}
                    linkUrl={brief.landingPageUrl}
                    advertiser={brand || brief.name}
                  />
                </article>
              ) : null}
              <SharedBriefFeedbackBar
                briefId={brief.id}
                allowFeedback={allowFeedback}
                token={page.token}
                feedback={feedback}
                onSubmitted={appendFeedback}
              />
            </section>
          ))
        )}

        {page.campaignDrafts && page.campaignDrafts.length > 0 ? (
          <section className="flex flex-col gap-4" data-testid="shared-campaign-drafts" dir="auto">
            <h2 className="border-b border-border pb-2 text-lg font-semibold">{t('campaignDraftsHeading')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {page.campaignDrafts.map((draft) => (
                <article key={draft.targetId} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{draft.campaignName}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
                        {draft.platform === 'meta' ? t('campaignDraftPlatformMeta') : t('campaignDraftPlatformGoogle')}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground tabular-nums">
                        {t('campaignDraftDailyBudget', { budget: draft.dailyBudgetUsd })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {draft.ads.map((ad, idx) =>
                      draft.platform === 'google_ads' ? (
                        <SearchResultPreview
                          key={`${draft.targetId}-${idx}`}
                          headlines={ad.headlines && ad.headlines.length > 0 ? ad.headlines : [ad.headline]}
                          descriptions={ad.descriptions && ad.descriptions.length > 0 ? ad.descriptions : [ad.primaryText]}
                          path1=""
                          path2=""
                          linkUrl={ad.linkUrl}
                          advertiser={brand || draft.campaignName}
                        />
                      ) : (
                        <div key={`${draft.targetId}-${idx}`} className="flex flex-col gap-1 rounded-xl border border-border/70 bg-muted/30 p-3 text-xs">
                          <span className="font-semibold text-foreground">{ad.headline}</span>
                          {ad.primaryText ? <p className="text-foreground/90">{ad.primaryText}</p> : null}
                          {ad.description ? <p className="text-muted-foreground">{ad.description}</p> : null}
                          {ad.audience ? <span className="text-[11px] text-muted-foreground">{ad.audience}</span> : null}
                        </div>
                      ),
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <SharedGeneralRequestSection
          allowFeedback={allowFeedback}
          token={page.token}
          feedback={feedback}
          onSubmitted={appendFeedback}
        />
      </main>
    </BrandLogoProvider>
  );
}

/** The one page for an unknown, revoked or expired link: says nothing about which. */
export function SharedAdsInactive(): React.ReactElement {
  const t = useTranslations('AdShare.public');
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center" data-testid="shared-ads-inactive">
      <LinkIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">{t('inactiveTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('inactiveBody')}</p>
    </main>
  );
}

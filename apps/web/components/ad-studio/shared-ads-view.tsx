'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, LinkIcon } from 'lucide-react';
import { formatShareDate, type SharedAdsPage, type SharedImageAd } from '@/lib/ad-studio/share-view';
import { AdPlacementPreview, IMAGE_PLACEMENTS, imageForPlacement, type AdPlacement } from './ad-placement-preview';
import { BrandLogoProvider } from './brand-logo';

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
  const locale = useLocale();
  const brand = page.brandName.trim();

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
        </header>

        {page.briefs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="shared-ads-empty">
            {t('empty')}
          </p>
        ) : (
          page.briefs.map((brief) => (
            <section key={brief.id} className="flex flex-col gap-4" aria-labelledby={`shared-brief-${brief.id}`} data-testid="shared-brief">
              <h2 id={`shared-brief-${brief.id}`} className="border-b border-border pb-2 text-lg font-semibold" dir="auto">
                {brief.name}
              </h2>
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
                {brief.images.map((idea) => (
                  <article key={idea.conceptId} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="shared-image">
                    <h3 className="text-sm font-semibold">{t('idea', { index: idea.index })}</h3>
                    <AdPlacementPreview
                      copy={idea.copy}
                      media={{ kind: 'image', byFormat: idea.byFormat, alt: idea.copy?.headline || t('idea', { index: idea.index }) }}
                      advertiser={brand || brief.name}
                      linkUrl={brief.landingPageUrl}
                      placements={sharedImagePlacements(idea.byFormat)}
                    />
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
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

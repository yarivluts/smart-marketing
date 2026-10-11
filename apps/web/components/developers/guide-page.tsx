import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHero } from '@/components/viz';
import { adjacentGuides, developerGuideHref, type DeveloperGuideKey } from '@/lib/developers/guides';
import { GuidePager } from './doc-parts';

/** The frame of every guide: its header, the sections, and links to the previous and next guides. */
export async function GuidePage({
  guide,
  icon,
  children,
}: {
  guide: DeveloperGuideKey;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const t = await getTranslations('Developers');
  const { previous, next } = adjacentGuides(guide);
  return (
    <article className="flex flex-col gap-pp-xl">
      <PageHero icon={icon} eyebrow={t('nav.area')} title={t(`${guide}.title`)} description={t(`${guide}.intro`)} />
      {children}
      <GuidePager
        previous={previous ? { href: developerGuideHref(previous), title: t(`nav.${previous.key}`) } : undefined}
        next={next ? { href: developerGuideHref(next), title: t(`nav.${next.key}`) } : undefined}
        previousLabel={t('common.previous')}
        nextLabel={t('common.next')}
      />
    </article>
  );
}

/** Page metadata for a guide (title + description from its translation namespace). */
export async function guideMetadata(locale: string, guide: DeveloperGuideKey) {
  const t = await getTranslations({ locale, namespace: 'Developers' });
  return { title: `${t(`${guide}.title`)} - ${t('nav.area')}`, description: t(`${guide}.intro`) };
}

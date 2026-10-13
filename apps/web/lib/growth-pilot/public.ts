import 'server-only';
import { cache } from 'react';
import { getPublishedGrowthLanding } from '@growthos/firebase-orm-models';
import { isRtlLanguage, siteHost, type GrowthLandingContent } from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export interface PublicLandingPage {
  slug: string;
  content: GrowthLandingContent;
  language: string;
  dir: 'rtl' | 'ltr';
  ctaUrl: string;
  host: string;
}

/**
 * A published landing page by its public address, read once per request (the layout and the page
 * both ask). Null for drafts, rejected pages and unknown addresses alike - nothing tells them apart.
 */
export const loadPublicLanding = cache(async (slug: string): Promise<PublicLandingPage | null> => {
  await ensureFirestoreOrm();
  const page = await getPublishedGrowthLanding(slug);
  if (!page) return null;
  return {
    slug: page.slug,
    content: page.content,
    language: page.language,
    dir: isRtlLanguage(page.language) ? 'rtl' : 'ltr',
    ctaUrl: page.cta_url,
    host: siteHost(page.cta_url),
  };
});

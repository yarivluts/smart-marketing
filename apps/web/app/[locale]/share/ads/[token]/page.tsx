import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { loadSharedAds } from '@/lib/ad-studio/share';
import { SharedAdsInactive, SharedAdsView } from '@/components/ad-studio/shared-ads-view';

type PageProps = Readonly<{ params: Promise<{ locale: string; token: string }> }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: 'AdShare.public' });
  const page = await loadSharedAds(token);
  const brand = page?.brandName.trim();
  return {
    title: brand ? t('titleWithBrand', { brand }) : t('title'),
    // A private link to a client: never indexed, and the token never leaves in a Referer header.
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/**
 * A client's read-only view of the ads an agency shared with them (`/share/ads/<token>`). No
 * sign-in; the token is the key. An unknown, revoked or expired token gets the same friendly page.
 */
export default async function SharedAdsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const page = await loadSharedAds(token);
  return page ? <SharedAdsView page={page} /> : <SharedAdsInactive />;
}

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { HomeHeader } from '@/components/home/home-header';
import { HomeHero } from '@/components/home/home-hero';
import { HomeSteps } from '@/components/home/home-steps';
import { HomeFeatures } from '@/components/home/home-features';
import { HomeControl } from '@/components/home/home-control';
import { HomeFaq } from '@/components/home/home-faq';
import { HomeCta, HomeFooter } from '@/components/home/home-cta';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'HomePage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * The public home page: what GrowthOS does for someone who knows nothing about online marketing -
 * enter your website, the AI prepares ads, landing pages and audiences, you approve - and the way in.
 * Only true statements: no invented numbers, prices, customers or testimonials. A signed-in visitor
 * is offered their account (/start) instead of sign-up.
 */
export default async function HomePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const signedIn = (await getServerSession().catch(() => null)) !== null;

  return (
    <div className="flex min-h-screen flex-col bg-pp-background font-pp-body text-pp-on-surface">
      <HomeHeader signedIn={signedIn} />
      <main id="main-content" className="flex-1">
        <HomeHero signedIn={signedIn} />
        <HomeSteps />
        <HomeFeatures />
        <HomeControl />
        <HomeFaq />
        <HomeCta signedIn={signedIn} />
      </main>
      <HomeFooter />
    </div>
  );
}

import { setRequestLocale } from 'next-intl/server';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingPreviewCard } from '@/components/landing/landing-preview-card';
import { LandingConnectors } from '@/components/landing/landing-connectors';
import { LandingPillars } from '@/components/landing/landing-pillars';
import { LandingPricing } from '@/components/landing/landing-pricing';
import { GrowthRoiCalculator } from '@/components/landing/growth-roi-calculator';
import { LiveEventStreamTicker } from '@/components/landing/live-event-stream-ticker';
import { LandingComparison } from '@/components/landing/landing-comparison';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingCta } from '@/components/landing/landing-cta';
import { LandingFooter } from '@/components/landing/landing-footer';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params: _params }: PageProps) {
  return {
    title: 'GrowthOS • Precision Telemetry & Autonomous Growth Engine',
    description:
      'Unified ad attribution, real-time cohort breakeven pacing, and autonomous AI budget optimization in one operating system.',
  };
}

export default async function HomePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F3FB] text-pp-on-surface font-pp-body selection:bg-pp-primary-fixed selection:text-pp-on-primary-fixed relative overflow-x-hidden">
      <LandingHeader />
      <main id="main-content" className="flex-1 relative">
        <LandingHero />
        <LandingPreviewCard />
        <LandingConnectors />
        <LandingPillars />
        <LandingPricing />
        <section id="calculator" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-24">
          <GrowthRoiCalculator />
        </section>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-24">
          <LiveEventStreamTicker />
        </div>
        <LandingComparison />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}

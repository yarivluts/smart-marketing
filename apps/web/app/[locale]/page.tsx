import { setRequestLocale } from 'next-intl/server';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingHero } from '@/components/landing/landing-hero';
import { LiveEventStreamTicker } from '@/components/landing/live-event-stream-ticker';
import { ProductDemoShowcase } from '@/components/landing/product-demo-showcase';
import { GrowthRoiCalculator } from '@/components/landing/growth-roi-calculator';
import { InteractiveExperimentLab } from '@/components/landing/interactive-experiment-lab';
import { LandingPillars } from '@/components/landing/landing-pillars';
import { LandingComparison } from '@/components/landing/landing-comparison';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingCta } from '@/components/landing/landing-cta';
import { LandingFooter } from '@/components/landing/landing-footer';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function HomePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20">
      <LandingHeader />
      <main id="main-content" className="flex-1">
        <LandingHero />
        <LiveEventStreamTicker />
        <ProductDemoShowcase />
        <GrowthRoiCalculator />
        <InteractiveExperimentLab />
        <LandingPillars />
        <LandingComparison />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}

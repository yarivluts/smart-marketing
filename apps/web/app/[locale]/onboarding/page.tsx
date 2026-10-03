import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { OnboardingWizardCard } from '@/components/auth/onboarding-wizard-card';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

/**
 * Global workspace setup wizard (standalone full-page layout matching Stitch 986fc1ad & 22675f2c).
 */
export default async function GlobalOnboardingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-pp-surface-container-low text-pp-on-surface antialiased flex flex-col justify-between selection:bg-pp-primary-fixed selection:text-pp-on-primary-fixed relative overflow-x-hidden">
      {/* Ambient Pastel Glows */}
      <div className="absolute -top-24 -start-24 w-96 h-96 bg-pp-primary-fixed rounded-full blur-3xl opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 -end-24 w-96 h-96 bg-pp-secondary-fixed rounded-full blur-3xl opacity-25 pointer-events-none" />

      {/* Top App Bar */}
      <header className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-pp-primary flex items-center justify-center text-pp-on-primary shadow-pp-candy">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface">GrowthOS</span>
              <span className="text-[11px] font-semibold text-pp-on-surface-variant uppercase tracking-wider">Enterprise Setup</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-secondary-container/40 text-pp-on-secondary-container text-pp-label-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-pp-secondary animate-pulse" />
              <span>SOC-2 Verified</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Stage */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        <Suspense>
          <OnboardingWizardCard />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-pp-body-sm text-pp-outline border-t border-pp-surface-container/60">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pp-secondary" />
            <p>© 2026 GrowthOS Inc. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-pp-on-surface transition-colors">Privacy Policy</span>
            <span className="hover:text-pp-on-surface transition-colors">Terms of Service</span>
            <span className="hover:text-pp-on-surface transition-colors">Security Compliance</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OnboardingWizardCard } from '@/components/auth/onboarding-wizard-card';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

export default async function GlobalOnboardingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-80px)] items-center justify-center p-4 sm:p-8">
      <Suspense>
        <OnboardingWizardCard />
      </Suspense>
    </main>
  );
}

import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutomationHub } from '@/components/automation/automation-hub';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Automation' });
  return { title: t('metaTitle') || 'Automation Hub' };
}

export default async function TopLevelAutomationPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6">
      <Suspense>
        <AutomationHub
          orgId="default-org"
          projectId="default-project"
          projectName="GrowthOS Cockpit"
        />
      </Suspense>
    </main>
  );
}

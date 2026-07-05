import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DashboardContent } from '@/components/auth/dashboard-content';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'DashboardPage' });
  return { title: t('title') };
}

export default async function DashboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardContent />;
}

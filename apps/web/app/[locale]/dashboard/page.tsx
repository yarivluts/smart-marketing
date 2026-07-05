import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DashboardContent } from '@/components/auth/dashboard-content';
import { getServerSession } from '@/lib/auth/get-server-session';

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

  // The middleware only checks that a session cookie is present (it can't
  // run the Admin SDK on the Edge runtime); this is the real verification
  // that makes /dashboard an actually-protected route, not just a UX-level
  // redirect. See lib/auth/get-server-session.ts.
  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Fdashboard`);
  }

  return <DashboardContent />;
}

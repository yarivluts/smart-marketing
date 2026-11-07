import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, BellRing } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { AccountHeader } from '@/components/auth/account-header';
import { NotificationSettings } from '@/components/push/notification-settings';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PushNotifications' });
  return { title: t('metaTitle') };
}

/**
 * "Notifications & app" in the person's own account: push permission and devices, which updates to
 * hear about, a test, and installing the app. Per person, so it lives with the account rather than
 * in an org or project's settings, and every member can reach it.
 */
export default async function NotificationsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Fdashboard%2Fnotifications`);
  }
  const t = await getTranslations('PushNotifications');

  return (
    <div className="flex min-h-screen flex-col bg-pp-surface-container-low text-pp-on-surface">
      <AccountHeader email={session.email ?? ''} />
      <main className="container mx-auto flex max-w-6xl flex-1 flex-col gap-6 py-10">
        <Link href="/dashboard" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t('backToDashboard')}
        </Link>
        <PageHero icon={BellRing} eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
        <NotificationSettings />
      </main>
    </div>
  );
}

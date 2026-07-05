import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { getServerSession } from '@/lib/auth/get-server-session';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth' });
  return { title: t('signInTitle') };
}

export default async function LoginPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  // A real (verified) session redirects away from login. This deliberately
  // does NOT mirror `middleware.ts`'s cookie-presence check: a stale/forged
  // cookie must never bounce a visitor away from the one page that can get
  // them a real session.
  const session = await getServerSession();
  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <Suspense>
      <EmailPasswordForm mode="signin" />
    </Suspense>
  );
}

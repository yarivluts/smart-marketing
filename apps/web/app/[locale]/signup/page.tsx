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
  return { title: t('signUpTitle') };
}

export default async function SignupPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  // See login/page.tsx: a real (verified) session redirects away from
  // signup, but this intentionally does not use middleware.ts's
  // cookie-presence check for the same reason documented there.
  const session = await getServerSession();
  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <Suspense>
      <EmailPasswordForm mode="signup" />
    </Suspense>
  );
}

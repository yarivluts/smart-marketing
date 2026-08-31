import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { AuthCard } from '@/components/auth/auth-card';
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

  // A real (verified) session redirects away from signup.
  const session = await getServerSession();
  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <AuthCard showBrandingSide={true}>
      <Suspense>
        <EmailPasswordForm mode="signup" />
      </Suspense>
    </AuthCard>
  );
}

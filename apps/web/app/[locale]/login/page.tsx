import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmailPasswordForm } from '@/components/auth/email-password-form';

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
  return <EmailPasswordForm mode="signin" />;
}

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TokenSignIn } from '@/components/auth/token-sign-in';
import { getServerSession } from '@/lib/auth/get-server-session';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth' });
  return { title: t('signInTitle') };
}

/** See `TokenSignIn`'s own doc comment — a deliberately unlinked, `/login`-sibling sign-in path for a Firebase custom token. */
export default async function TokenSignInPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <Suspense>
      <TokenSignIn />
    </Suspense>
  );
}

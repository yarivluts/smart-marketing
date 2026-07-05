import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateOrganizationForm } from '@/components/orgs/create-organization-form';
import { getServerSession } from '@/lib/auth/get-server-session';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'NewOrgPage' });
  return { title: t('title') };
}

export default async function NewOrgPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2Fnew`);
  }

  const t = await getTranslations('NewOrgPage');

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <CreateOrganizationForm />
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CreateProjectForm } from '@/components/orgs/create-project-form';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'NewProjectPage' });
  return { title: t('title') };
}

export default async function NewProjectPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2Fnew`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = memberships.find((entry) => entry.organizationId === orgId && entry.status !== 'invited');
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const t = await getTranslations('NewProjectPage');

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <CreateProjectForm orgId={orgId} />
    </main>
  );
}

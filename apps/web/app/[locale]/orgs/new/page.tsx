import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2, FolderPlus, Plug, UserPlus } from 'lucide-react';
import { CreateOrganizationForm } from '@/components/orgs/create-organization-form';
import { NextStepsCard } from '@/components/orgs/next-steps-card';
import { ChartCard } from '@/components/viz/chart-card';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';

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

  const { memberships } = await resolveOrgSessionContext(session);
  const existingCount = memberships.filter((membership) => isActiveMembershipStatus(membership.status)).length;
  const t = await getTranslations('NewOrgPage');

  return (
    <main className="container mx-auto flex max-w-5xl flex-col gap-6 py-10">
      <PageHero
        icon={Building2}
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={existingCount > 0 ? t('heroDescriptionExisting', { count: existingCount }) : t('heroDescription')}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard className="lg:col-span-3" title={t('formTitle')} description={t('formDescription')} icon={Building2}>
          <div className="max-w-sm">
            <CreateOrganizationForm />
          </div>
        </ChartCard>
        <div className="lg:col-span-2">
          <NextStepsCard
            title={t('nextTitle')}
            steps={[
              { key: 'org', icon: Building2, title: t('nextOrgTitle'), description: t('nextOrgDescription') },
              { key: 'project', icon: FolderPlus, title: t('nextProjectTitle'), description: t('nextProjectDescription') },
              { key: 'data', icon: Plug, title: t('nextDataTitle'), description: t('nextDataDescription') },
              { key: 'team', icon: UserPlus, title: t('nextTeamTitle'), description: t('nextTeamDescription') },
            ]}
          />
        </div>
      </div>
    </main>
  );
}

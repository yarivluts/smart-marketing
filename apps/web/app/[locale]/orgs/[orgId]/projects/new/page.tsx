import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { FolderKanban, FolderPlus, GitMerge, LayoutDashboard, Layers, Plug } from 'lucide-react';
import { CreateProjectForm } from '@/components/orgs/create-project-form';
import { NextStepsCard } from '@/components/orgs/next-steps-card';
import { OrgShell } from '@/components/orgs/org-shell';
import { ChartCard } from '@/components/viz/chart-card';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';

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
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const [projects, t] = await Promise.all([listOrgProjects(orgId), getTranslations('NewProjectPage')]);

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-5xl flex-col gap-6 py-10">
        <PageHero icon={FolderPlus} eyebrow={membership.organizationName} title={t('title')} description={t('heroDescription')} />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-6 lg:col-span-3">
            <ChartCard title={t('formTitle')} description={t('formDescription')} icon={FolderPlus}>
              <div className="max-w-sm">
                <CreateProjectForm orgId={orgId} />
              </div>
            </ChartCard>
            <ChartCard title={t('existingTitle')} description={t('existingDescription', { count: projects.length })} icon={FolderKanban}>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('existingNone')}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {projects.map((project) => (
                    <li key={project.id} className="flex items-center gap-2 rounded-full border border-border bg-background/60 py-1 pe-3 ps-1 text-sm">
                      <InitialsAvatar name={project.name} seed={project.id} size="sm" />
                      <span className="text-foreground">{project.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
          <div className="lg:col-span-2">
            <NextStepsCard
              title={t('nextTitle')}
              description={t('nextDescription')}
              steps={[
                { key: 'pack', icon: Layers, title: t('nextPackTitle'), description: t('nextPackDescription') },
                { key: 'source', icon: Plug, title: t('nextSourceTitle'), description: t('nextSourceDescription') },
                { key: 'funnel', icon: GitMerge, title: t('nextFunnelTitle'), description: t('nextFunnelDescription') },
                { key: 'board', icon: LayoutDashboard, title: t('nextBoardTitle'), description: t('nextBoardDescription') },
              ]}
            />
          </div>
        </div>
      </main>
    </OrgShell>
  );
}

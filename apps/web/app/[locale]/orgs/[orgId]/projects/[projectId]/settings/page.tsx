import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Archive, BadgeCheck, Clock, Coins, FolderKanban, Layers, Settings } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listOrgProjectsIncludingArchived } from '@/lib/orgs/queries';
import { ProjectSettingsForm } from '@/components/orgs/project-settings-form';
import { ArchiveProjectButton } from '@/components/orgs/archive-project-button';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectSettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin corrects a project's own `name`/`vertical` once it's been
 * created — see `updateProjectDetails`'s doc comment for why this closes a
 * gap that's existed since KAN-25. `session_replay_url_template` has its
 * own dedicated page (`.../session-replay`).
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the session-replay and cost-guardrails pages use.
 */
export default async function ProjectSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsettings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) {
    notFound();
  }

  // Including archived: this is the one page that must still resolve an archived project, so an admin can unarchive it.
  const [projects, environments] = await Promise.all([listOrgProjectsIncludingArchived(orgId), listEnvironmentsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const t = await getTranslations('ProjectSettings');
  const tEnv = await getTranslations('EnvBadge');
  const archived = project.archived_at !== undefined && project.archived_at !== null;
  // How much of the project's own profile is declared: name is required; vertical, currency and time zone are optional but every report reads them.
  const profileFields = [project.name, project.vertical, project.currency, project.timezone];
  const filled = profileFields.filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  const completeness = Math.round((filled / profileFields.length) * 100);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Settings} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('intro')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('kpiProfile')}
            value={`${completeness}%`}
            icon={BadgeCheck}
            progress={completeness}
            subtext={t('kpiProfileSubtext', { filled, total: profileFields.length })}
          />
          <StatCard title={t('kpiCurrency')} value={project.currency || t('notDeclared')} icon={Coins} />
          <StatCard title={t('kpiTimezone')} value={project.timezone || t('notDeclared')} icon={Clock} />
          <StatCard title={t('kpiEnvironments')} value={String(environments.length)} icon={Layers} subtext={archived ? t('kpiArchived') : t('kpiActive')} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title={t('formTitle')} description={t('formDescription')} icon={Settings}>
          <ProjectSettingsForm
            orgId={orgId}
            projectId={projectId}
            initialName={project.name}
            initialVertical={project.vertical ?? ''}
            initialCurrency={project.currency ?? ''}
            initialTimezone={project.timezone ?? ''}
          />
        </ChartCard>

        <div className="flex flex-col gap-6">
          <ChartCard title={t('profileTitle')} icon={FolderKanban}>
            <div className="flex items-center gap-3">
              <InitialsAvatar name={project.name} seed={projectId} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{project.name}</p>
                <p className="truncate text-xs text-muted-foreground">{project.vertical || t('notDeclared')}</p>
              </div>
            </div>
            <p className="mt-3 truncate rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground" dir="ltr">
              {projectId}
            </p>
          </ChartCard>

          <ChartCard title={t('environmentsTitle')} description={t('environmentsDescription')} icon={Layers}>
            {environments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('environmentsNone')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {environments.map((environment) => (
                  <li key={environment.id} className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                    {tEnv(environment.name)}
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Archive className="h-5 w-5 text-destructive" aria-hidden="true" />
          {t('archiveHeading')}
        </h2>
        <p className="text-sm text-muted-foreground">{archived ? t('archivedNote', { at: project.archived_at ?? '' }) : t('archiveHelp')}</p>
        <div>
          <ArchiveProjectButton orgId={orgId} projectId={projectId} archived={archived} />
        </div>
      </section>
    </main>
  );
}

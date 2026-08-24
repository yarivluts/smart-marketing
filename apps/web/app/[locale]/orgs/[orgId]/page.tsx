import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { OrgShell } from '@/components/orgs/org-shell';
import { ProjectSwitcher } from '@/components/orgs/project-switcher';
import { EnvBadge } from '@/components/orgs/env-badge';
import { MembersList } from '@/components/orgs/members-list';
import { InviteMemberForm } from '@/components/orgs/invite-member-form';
import { FeatureLaunchpad } from '@/components/orgs/feature-launchpad';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Users, FolderKanban } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { findActiveMembership } from '@/lib/orgs/access';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ project?: string; env?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgDetailPage' });
  return { title: t('title') };
}

/**
 * Org home: org overview, project switcher, environment selector,
 * categorized capability launchpad, and team management.
 */
export default async function OrgDetailPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  const { project: projectIdParam, env: envParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const [projects, members] = await Promise.all([listOrgProjects(orgId), listOrgMembers(orgId)]);
  const currentProjectId = projectIdParam ?? projects[0]?.id;
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];
  const currentEnv: Environment = envParam && isEnvironment(envParam) ? envParam : 'dev';

  const principal = { type: 'user' as const, id: user.id };
  const canManageMembers = can(bindings, principal, 'members.manage', { orgId });
  const canManageProjects = can(bindings, principal, 'project.manage', { orgId });
  const canManageKeys = can(bindings, principal, 'keys.manage', { orgId });
  const canManageSchemas = can(bindings, principal, 'schema.write', { orgId });
  const canManageMetrics = can(bindings, principal, 'metrics.write', { orgId });
  const canViewIngestHealth = can(bindings, principal, 'ingest.write', { orgId });
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });
  const canViewBoards = can(bindings, principal, 'dashboards.read', { orgId }) || canManageBoards;
  const canRunAutomation = can(bindings, principal, 'automation.execute', { orgId });
  const canViewAuditLog = can(bindings, principal, 'audit.read', { orgId });

  const t = await getTranslations('OrgDetailPage');

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-5xl flex-col gap-10 py-10 px-4 sm:px-6">
        {/* Organization Header */}
        <header className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:p-8 shadow-soft">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {membership.organizationName}
              </h1>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {membership.role}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
                {projects.length} {t('projectsHeading')}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {members.length} {t('membersHeading')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canManageProjects ? (
              <Button asChild size="sm">
                <Link href={`/orgs/${orgId}/projects/new`}>
                  <Plus className="me-1 h-4 w-4" aria-hidden="true" />
                  {t('newProject')}
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        {/* Project Selector & Launchpad */}
        <section className="flex flex-col gap-6" aria-labelledby="projects-section-heading">
          {projects.length === 0 ? (
            <Card className="bg-brand-wash flex flex-col items-center justify-center gap-4 p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{t('noProjects')}</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t('launchpadSubheading', { projectName: membership.organizationName })}
                </p>
              </div>
              {canManageProjects ? (
                <Button asChild className="mt-2">
                  <Link href={`/orgs/${orgId}/projects/new`}>
                    <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
                    {t('newProject')}
                  </Link>
                </Button>
              ) : null}
            </Card>
          ) : (
            <>
              {/* Project Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ProjectSwitcher
                    orgId={orgId}
                    projects={projects}
                    currentProjectId={currentProjectId}
                    currentEnv={currentEnv}
                  />
                  {currentProjectId ? (
                    <EnvBadge orgId={orgId} projectId={currentProjectId} currentEnv={currentEnv} />
                  ) : null}
                </div>

                {currentProjectId ? (
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/projects/${currentProjectId}/boards`}>
                        {t('projectBoardsLink')}
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Categorized Launchpad */}
              {currentProjectId && currentProject ? (
                <FeatureLaunchpad
                  orgId={orgId}
                  projectId={currentProjectId}
                  projectName={currentProject.name}
                  permissions={{
                    canManageBoards,
                    canViewBoards,
                    canManageSchemas,
                    canManageMetrics,
                    canViewIngestHealth,
                    canManagePlugins,
                    canRunAutomation,
                    canManageKeys,
                    canManageProjects,
                    canViewAuditLog,
                  }}
                />
              ) : null}
            </>
          )}
        </section>

        {/* Team & Members */}
        <section className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-soft" aria-labelledby="members-section-heading">
          <div className="flex flex-col gap-1">
            <h2 id="members-section-heading" className="text-xl font-bold tracking-tight text-foreground">
              {t('membersHeading')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('membersSubheading')}</p>
          </div>

          <div className="flex flex-col gap-6">
            <MembersList orgId={orgId} members={members} canManageMembers={canManageMembers} />
            {canManageMembers ? (
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
                <InviteMemberForm orgId={orgId} />
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </OrgShell>
  );
}


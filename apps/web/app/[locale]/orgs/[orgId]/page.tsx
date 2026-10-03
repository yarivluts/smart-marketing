import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, isInvitableRole, ENVIRONMENTS, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { OrgShell } from '@/components/orgs/org-shell';
import { ChangeRoleControl } from '@/components/orgs/change-role-control';
import { SuspendMemberButton } from '@/components/orgs/suspend-member-button';
import { ReactivateMemberButton } from '@/components/orgs/reactivate-member-button';
import { RemoveMemberButton } from '@/components/orgs/remove-member-button';
import { InviteMemberForm } from '@/components/orgs/invite-member-form';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  Activity,
  ArrowRight,
  Database,
  FolderKanban,
  Layers,
  Mail,
  Megaphone,
  Network,
  Plus,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ project?: string; env?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgDetailPage' });
  return { title: t('title') };
}

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
  const currentEnv: Environment = envParam && isEnvironment(envParam) ? envParam : 'dev';

  const principal = { type: 'user' as const, id: user.id };
  const canManageMembers = can(bindings, principal, 'members.manage', { orgId });
  const canManageProjects = can(bindings, principal, 'project.manage', { orgId });
  const canManageBilling = can(bindings, principal, 'billing.manage', { orgId });

  const administeredProjects = projects
    .filter((project) => can(bindings, principal, 'project.manage', { orgId, projectId: project.id }))
    .map((project) => ({ id: project.id, name: project.name }));

  const [t, tEnv] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('EnvBadge'),
  ]);

  const activeMembersCount = members.filter((m) => m.status === 'active').length;

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-7xl flex-col gap-10 py-10 px-4 sm:px-6 lg:px-8">
        {/* Workspace Top Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-border/50">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <span className="flex h-2 w-2 rounded-full bg-primary" />
              <span>{t('workspaceHubBadge')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {membership.organizationName}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {t('workspaceId', { orgId })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/orgs/${orgId}/audit-log`}>
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('auditLogLink')}</span>
              </Link>
            </Button>
            {canManageBilling ? (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/orgs/${orgId}/settings`}>
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('orgSettingsLink')}</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        {/* Workspace Health & KPI Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Workspace Health Indicators">
          <StatCard
            title={t('kpiTotalProjects')}
            value={projects.length}
            icon={FolderKanban}
            badge={<Badge variant="secondary" size="sm">{t('kpiBadgeProjects')}</Badge>}
            subtext={t('kpiWorkspacesCount', { count: projects.length })}
          />
          <StatCard
            title={t('kpiActiveMembers')}
            value={activeMembersCount}
            icon={Users}
            badge={<Badge variant="info" size="sm">{t('kpiBadgeTeam')}</Badge>}
            subtext={t('kpiAccountsCount', { count: members.length })}
          />
          <StatCard
            title={t('kpiStreamHealth')}
            value={t('kpiStreamHealthValue')}
            icon={Activity}
            badge={<Badge variant="emerald" dot size="sm">{t('projectStatusHealthy')}</Badge>}
            subtext={t('kpiStreamingSubtext')}
          />
          <StatCard
            title={t('kpiEnvironment')}
            value={currentEnv.toUpperCase()}
            icon={Database}
            badge={
              <Badge
                variant={currentEnv === 'prod' ? 'destructive' : currentEnv === 'staging' ? 'warning' : 'secondary'}
                size="sm"
              >
                {tEnv(currentEnv)}
              </Badge>
            }
            subtext={t('kpiPartitionSubtext')}
          />
        </section>

        {/* Projects Section with Rich Cards */}
        <section className="flex flex-col gap-6" aria-label="Organization Projects">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t('projectsHeading')}
              </h2>
              <Badge variant="secondary" size="sm">
                <span dir="ltr">{projects.length}</span>
              </Badge>
            </div>

            {canManageProjects ? (
              <Button asChild size="sm" className="bg-brand-gradient text-white shadow-soft">
                <Link href={`/orgs/${orgId}/projects/new`} className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('newProject')}</span>
                </Link>
              </Button>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <Card className="bg-brand-wash flex flex-col items-start gap-4 p-8 rounded-2xl border-dashed">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">{t('noProjectsHeading')}</h3>
                <p className="text-muted-foreground text-sm max-w-md mt-1">
                  {t('noProjects')}
                </p>
              </div>
              {canManageProjects ? (
                <Button asChild className="bg-brand-gradient text-white shadow-soft mt-2">
                  <Link href={`/orgs/${orgId}/projects/new`} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    <span>{t('newProject')}</span>
                  </Link>
                </Button>
              ) : null}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => {
                const isSelected = project.id === currentProjectId;
                return (
                  <Card
                    key={project.id}
                    hoverable
                    className={cn(
                      'flex flex-col justify-between p-6 rounded-2xl border bg-card transition-all duration-200 shadow-soft',
                      isSelected ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border/80',
                    )}
                  >
                    <div>
                      {/* Project Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold shadow-soft">
                            <FolderKanban className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground text-base tracking-tight line-clamp-1">
                              {project.name}
                            </h3>
                            <span className="text-[11px] font-medium text-muted-foreground">
                              {t('projectVerticalLabel', { vertical: project.vertical || 'B2B SaaS' })}
                            </span>
                          </div>
                        </div>

                        <Badge variant="emerald" dot size="sm">
                          {t('projectStatusActive')}
                        </Badge>
                      </div>

                      {/* Interactive Environment Switcher */}
                      <div className="my-4 rounded-xl border border-border/60 bg-muted/40 p-1.5">
                        <div role="group" aria-label={tEnv('label')} className="flex items-center gap-1">
                          {ENVIRONMENTS.map((env) => {
                            const isActive = isSelected && env === currentEnv;
                            return (
                              <Link
                                key={env}
                                href={{ pathname: `/orgs/${orgId}`, query: { project: project.id, env } }}
                                aria-current={isActive ? 'true' : undefined}
                                className={cn(
                                  'flex-1 text-center rounded-lg py-1 text-[11px] font-semibold uppercase transition-all',
                                  isActive
                                    ? 'bg-background text-foreground shadow-soft border border-border/80'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {tEnv(env)}
                              </Link>
                            );
                          })}
                        </div>
                      </div>

                      {/* Primary Overview Pulse Navigation */}
                      <div className="mb-4">
                        <Button asChild size="sm" className="w-full bg-brand-gradient text-white shadow-soft hover:opacity-95">
                          <Link href={`/orgs/${orgId}/projects/${project.id}`} className="flex items-center justify-center gap-2">
                            <Activity className="h-3.5 w-3.5" />
                            <span>{t('openPulseAction')}</span>
                            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    {/* Quick-Nav Grid */}
                    <div className="border-t border-border/50 pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/campaigns`}
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Megaphone className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{t('quickNavCampaigns')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/funnel`}
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Layers className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{t('quickNavFunnel')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/cohorts`}
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <TrendingUp className="h-3 w-3 text-indigo-500 shrink-0" />
                          <span className="truncate">{t('quickNavCohorts')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/integrations`}
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Network className="h-3 w-3 text-purple-500 shrink-0" />
                          <span className="truncate">{t('quickNavIntegrations')}</span>
                        </Link>
                      </div>

                      <div className="mt-2.5 flex justify-end">
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/settings`}
                          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Settings className="h-3 w-3" />
                          <span>{t('quickNavSettings')}</span>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Member Role Management Section */}
        <section className="flex flex-col gap-6" aria-label="Member Role Management">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t('membersHeading')}
              </h2>
              <Badge variant="secondary" size="sm">
                <span dir="ltr">{members.length}</span>
              </Badge>
            </div>
          </div>

          {/* Elevated Members Table / List */}
          <div className="rounded-2xl border border-border/80 bg-card shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <th className="py-3 px-5">{t('memberColUser')}</th>
                    <th className="py-3 px-5">{t('memberColRole')}</th>
                    <th className="py-3 px-5">{t('memberColStatus')}</th>
                    <th className="py-3 px-5">{t('memberColScope')}</th>
                    <th className="py-3 px-5 text-right rtl:text-left">{t('memberColActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {members.map((member) => {
                    const changeableRole = isInvitableRole(member.role) ? member.role : null;
                    const memberProjectName = member.projectId
                      ? (projects.find((p) => p.id === member.projectId)?.name ?? member.projectId)
                      : undefined;

                    return (
                      <tr key={member.membershipId} className="hover:bg-muted/20 transition-colors">
                        {/* Member Identity */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xs shadow-soft">
                              {member.email.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{member.email}</span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {member.membershipId.slice(0, 12)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-4 px-5">
                          {member.role === 'org_owner' ? (
                            <Badge variant="purple" size="sm">{t('roleOwner')}</Badge>
                          ) : member.role.includes('admin') ? (
                            <Badge variant="info" size="sm">{member.role}</Badge>
                          ) : member.role === 'editor' || member.role === 'operator' ? (
                            <Badge variant="default" size="sm">{member.role}</Badge>
                          ) : (
                            <Badge variant="secondary" size="sm">{member.role}</Badge>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-4 px-5">
                          {member.status === 'active' ? (
                            <Badge variant="emerald" dot size="sm">{t('statusActive')}</Badge>
                          ) : member.status === 'suspended' ? (
                            <Badge variant="amber" dot size="sm">{t('statusSuspended')}</Badge>
                          ) : (
                            <Badge variant="info" dot size="sm">{t('statusInvited')}</Badge>
                          )}
                        </td>

                        {/* Scope */}
                        <td className="py-4 px-5 text-xs text-muted-foreground">
                          {memberProjectName ? (
                            <Badge variant="outline" size="sm" className="font-normal">
                              {t('scopeProjectOnly', { name: memberProjectName })}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" size="sm" className="font-normal">
                              {t('scopeAllProjects')}
                            </Badge>
                          )}
                        </td>

                        {/* Action Controls */}
                        <td className="py-4 px-5">
                          <div className="flex items-center justify-end gap-2">
                            {canManageMembers && changeableRole ? (
                              <ChangeRoleControl
                                orgId={orgId}
                                membershipId={member.membershipId}
                                role={changeableRole}
                              />
                            ) : null}

                            {canManageMembers && member.status === 'active' ? (
                              <SuspendMemberButton orgId={orgId} membershipId={member.membershipId} />
                            ) : null}

                            {canManageMembers && member.status === 'suspended' ? (
                              <ReactivateMemberButton orgId={orgId} membershipId={member.membershipId} />
                            ) : null}

                            {canManageMembers ? (
                              <RemoveMemberButton orgId={orgId} membershipId={member.membershipId} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Elevated Invite Member Form Card */}
          {canManageMembers ? (
            <Card className="rounded-2xl border border-primary/20 bg-card/60 p-6 sm:p-8 backdrop-blur-sm shadow-soft">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">{t('inviteTeamMemberTitle')}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('inviteTeamMemberDesc')}
                  </p>
                </div>
              </div>
              <InviteMemberForm orgId={orgId} administeredProjects={administeredProjects} />
            </Card>
          ) : null}
        </section>
      </main>
    </OrgShell>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, isInvitableRole, ENVIRONMENTS, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { OrgShell } from '@/components/orgs/org-shell';
import {
  PpPage,
  PpPageHeader,
  PpButton,
  PpPill,
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpTable,
  PpEmptyState,
  PpIconChip,
} from '@/components/pastel/primitives';
import { ChangeRoleControl } from '@/components/orgs/change-role-control';
import { SuspendMemberButton } from '@/components/orgs/suspend-member-button';
import { ReactivateMemberButton } from '@/components/orgs/reactivate-member-button';
import { RemoveMemberButton } from '@/components/orgs/remove-member-button';
import { InviteMemberForm } from '@/components/orgs/invite-member-form';
import { cn } from '@/lib/utils';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  Activity,
  ArrowRight,
  FolderKanban,
  Layers,
  Mail,
  Megaphone,
  Network,
  Plus,
  Settings,
  Shield,
  TrendingUp,
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
      <PpPage>
        {/* Workspace Top Header */}
        <PpPageHeader
          eyebrow={t('workspaceHubBadge')}
          title={membership.organizationName}
          meta={t('workspaceId', { orgId })}
          actions={
            <>
              <PpButton asChild variant="secondary" size="sm" icon={Shield}>
                <Link href={`/orgs/${orgId}/audit-log`}>
                  <span>{t('auditLogLink')}</span>
                </Link>
              </PpButton>
              {canManageBilling ? (
                <PpButton asChild variant="secondary" size="sm" icon={Settings}>
                  <Link href={`/orgs/${orgId}/settings`}>
                    <span>{t('orgSettingsLink')}</span>
                  </Link>
                </PpButton>
              ) : null}
            </>
          }
        />

        {/* Workspace Health & KPI Summary Cards */}
        <PpKpiGrid>
          <PpKpiCard
            label={t('kpiTotalProjects')}
            value={projects.length}
            badge={t('kpiBadgeProjects')}
            badgeAccent="primary"
            accent="primary"
            footer={t('kpiWorkspacesCount', { count: projects.length })}
          />
          <PpKpiCard
            label={t('kpiActiveMembers')}
            value={activeMembersCount}
            badge={t('kpiBadgeTeam')}
            badgeAccent="mint"
            accent="mint"
            footer={t('kpiAccountsCount', { count: members.length })}
          />
          <PpKpiCard
            label={t('kpiEnvironment')}
            value={currentEnv.toUpperCase()}
            badge={tEnv(currentEnv)}
            badgeAccent={currentEnv === 'prod' ? 'error' : currentEnv === 'staging' ? 'amber' : 'neutral'}
            accent="sky"
            footer={t('kpiPartitionSubtext')}
          />
          <PpKpiCard
            label={t('kpiYourRole')}
            value={membership.role.toUpperCase()}
            badge={t('statusActive')}
            badgeAccent="mint"
            accent="pink"
            footer={t('workspaceHubBadge')}
          />
        </PpKpiGrid>

        {/* Projects Section */}
        <section className="space-y-4" aria-label="Organization Projects">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                {t('projectsHeading')}
              </h2>
              <PpPill accent="primary">{projects.length}</PpPill>
            </div>

            {canManageProjects ? (
              <PpButton asChild variant="primary" size="sm" icon={Plus}>
                <Link href={`/orgs/${orgId}/projects/new`}>
                  <span>{t('newProject')}</span>
                </Link>
              </PpButton>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <PpEmptyState
              icon={FolderKanban}
              title={t('noProjectsHeading')}
              description={t('noProjects')}
              action={
                canManageProjects ? (
                  <PpButton asChild variant="primary" size="sm" icon={Plus}>
                    <Link href={`/orgs/${orgId}/projects/new`}>
                      <span>{t('newProject')}</span>
                    </Link>
                  </PpButton>
                ) : null
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const isSelected = project.id === currentProjectId;
                return (
                  <div
                    key={project.id}
                    className={cn(
                      'flex flex-col justify-between rounded-2xl bg-pp-surface-container-lowest p-6 shadow-pp-candy transition-all duration-200 hover:shadow-pp-candy-hover',
                      isSelected ? 'ring-2 ring-pp-primary/40' : '',
                    )}
                  >
                    <div>
                      {/* Project Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <PpIconChip icon={FolderKanban} accent="primary" size="md" />
                          <div className="min-w-0">
                            <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface truncate">
                              {project.name}
                            </h3>
                            <span className="text-pp-label-sm text-pp-outline">
                              {t('projectVerticalLabel', { vertical: project.vertical || 'B2B SaaS' })}
                            </span>
                          </div>
                        </div>

                        <PpPill accent="mint" dot>
                          {t('projectStatusActive')}
                        </PpPill>
                      </div>

                      {/* Interactive Environment Switcher */}
                      <div className="my-4 rounded-xl bg-pp-surface-container p-1">
                        <div role="group" aria-label={tEnv('label')} className="flex items-center gap-1">
                          {ENVIRONMENTS.map((env) => {
                            const isActive = isSelected && env === currentEnv;
                            return (
                              <Link
                                key={env}
                                href={{ pathname: `/orgs/${orgId}`, query: { project: project.id, env } }}
                                aria-current={isActive ? 'true' : undefined}
                                className={cn(
                                  'flex-1 text-center rounded-lg py-1 font-pp-body text-[11px] font-semibold uppercase transition-all duration-150',
                                  isActive
                                    ? 'bg-pp-surface-container-lowest text-pp-on-surface shadow-xs font-bold'
                                    : 'text-pp-on-surface-variant hover:text-pp-on-surface',
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
                        <PpButton asChild variant="primary" size="sm" icon={Activity} className="w-full">
                          <Link href={`/orgs/${orgId}/projects/${project.id}`}>
                            <span>{t('openPulseAction')}</span>
                            <ArrowRight className="h-4 w-4 rtl:rotate-180 ms-1" />
                          </Link>
                        </PpButton>
                      </div>
                    </div>

                    {/* Quick-Nav Grid */}
                    <div className="border-t border-pp-surface-container-highest/60 pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/campaigns`}
                          className="flex items-center gap-1.5 rounded-xl bg-pp-surface-container-low px-2.5 py-1.5 font-pp-body text-pp-label-sm text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container hover:text-pp-on-surface"
                        >
                          <Megaphone className="h-3.5 w-3.5 text-pp-primary shrink-0" />
                          <span className="truncate">{t('quickNavCampaigns')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/funnel`}
                          className="flex items-center gap-1.5 rounded-xl bg-pp-surface-container-low px-2.5 py-1.5 font-pp-body text-pp-label-sm text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container hover:text-pp-on-surface"
                        >
                          <Layers className="h-3.5 w-3.5 text-pp-secondary shrink-0" />
                          <span className="truncate">{t('quickNavFunnel')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/cohorts`}
                          className="flex items-center gap-1.5 rounded-xl bg-pp-surface-container-low px-2.5 py-1.5 font-pp-body text-pp-label-sm text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container hover:text-pp-on-surface"
                        >
                          <TrendingUp className="h-3.5 w-3.5 text-pp-tertiary shrink-0" />
                          <span className="truncate">{t('quickNavCohorts')}</span>
                        </Link>
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/integrations`}
                          className="flex items-center gap-1.5 rounded-xl bg-pp-surface-container-low px-2.5 py-1.5 font-pp-body text-pp-label-sm text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container hover:text-pp-on-surface"
                        >
                          <Network className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          <span className="truncate">{t('quickNavIntegrations')}</span>
                        </Link>
                      </div>

                      <div className="mt-2.5 flex justify-end">
                        <Link
                          href={`/orgs/${orgId}/projects/${project.id}/settings`}
                          className="flex items-center gap-1 text-[11px] font-medium text-pp-outline hover:text-pp-on-surface"
                        >
                          <Settings className="h-3 w-3" />
                          <span>{t('quickNavSettings')}</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Member Role Management Section */}
        <section className="space-y-4" aria-label="Member Role Management">
          <div className="flex items-center gap-2.5">
            <h2 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
              {t('membersHeading')}
            </h2>
            <PpPill accent="primary">{members.length}</PpPill>
          </div>

          <PpCard flush>
            <PpTable>
              <thead>
                <tr>
                  <th>{t('memberColUser')}</th>
                  <th>{t('memberColRole')}</th>
                  <th>{t('memberColStatus')}</th>
                  <th>{t('memberColScope')}</th>
                  <th className="text-end">{t('memberColActions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const changeableRole = isInvitableRole(member.role) ? member.role : null;
                  const memberProjectName = member.projectId
                    ? (projects.find((p) => p.id === member.projectId)?.name ?? member.projectId)
                    : undefined;

                  return (
                    <tr key={member.membershipId}>
                      {/* Member Identity */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pp-primary-fixed font-pp-display text-pp-label-sm font-bold text-pp-on-primary-fixed shadow-sm">
                            {member.email.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-pp-on-surface truncate">{member.email}</span>
                            <span className="text-[11px] text-pp-outline font-mono truncate">
                              {member.membershipId.slice(0, 12)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td>
                        {member.role === 'org_owner' ? (
                          <PpPill accent="pink">{t('roleOwner')}</PpPill>
                        ) : member.role.includes('admin') ? (
                          <PpPill accent="sky">{member.role}</PpPill>
                        ) : member.role === 'editor' || member.role === 'operator' ? (
                          <PpPill accent="primary">{member.role}</PpPill>
                        ) : (
                          <PpPill accent="neutral">{member.role}</PpPill>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td>
                        {member.status === 'active' ? (
                          <PpPill accent="mint" dot>{t('statusActive')}</PpPill>
                        ) : member.status === 'suspended' ? (
                          <PpPill accent="amber" dot>{t('statusSuspended')}</PpPill>
                        ) : (
                          <PpPill accent="sky" dot>{t('statusInvited')}</PpPill>
                        )}
                      </td>

                      {/* Scope */}
                      <td className="text-pp-body-sm text-pp-outline">
                        {memberProjectName ? (
                          <span className="rounded-lg bg-pp-surface-container px-2 py-0.5 text-xs text-pp-on-surface">
                            {t('scopeProjectOnly', { name: memberProjectName })}
                          </span>
                        ) : (
                          <span className="rounded-lg bg-pp-surface-container px-2 py-0.5 text-xs text-pp-on-surface-variant">
                            {t('scopeAllProjects')}
                          </span>
                        )}
                      </td>

                      {/* Action Controls */}
                      <td className="text-end">
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
            </PpTable>
          </PpCard>

          {/* Invite Member Form Card */}
          {canManageMembers ? (
            <PpCard
              title={t('inviteTeamMemberTitle')}
              subtitle={t('inviteTeamMemberDesc')}
              icon={Mail}
              iconAccent="primary"
            >
              <InviteMemberForm orgId={orgId} administeredProjects={administeredProjects} />
            </PpCard>
          ) : null}
        </section>
      </PpPage>
    </OrgShell>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, type Environment } from '@growthos/shared';
import {
  Bot,
  Building2,
  Database,
  FolderKanban,
  History,
  Mail,
  Megaphone,
  PieChart,
  Plus,
  Settings,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { PageHero } from '@/components/viz/page-hero';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { Timeline } from '@/components/viz/timeline';
import { OrgShell } from '@/components/orgs/org-shell';
import { ProjectSwitcher } from '@/components/orgs/project-switcher';
import { EnvBadge } from '@/components/orgs/env-badge';
import { MembersList } from '@/components/orgs/members-list';
import { InviteMemberForm } from '@/components/orgs/invite-member-form';
import { ProjectHealthCard } from '@/components/orgs/project-health-card';
import { AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_TONES } from '@/components/orgs/audit-action-style';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listAuditLogEntriesForOrg, listOrgMembers, listOrgProjects } from '@/lib/orgs/queries';
import { findActiveMembership } from '@/lib/orgs/access';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { loadDashboardProject } from '@/lib/orgs/dashboard-overview';
import { toAuditLogEntryView } from '@/lib/orgs/audit-log-view';
import { auditActionCategory, topCounts } from '@/lib/orgs/workspace-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ project?: string; env?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgDetailPage' });
  return { title: t('title') };
}

const RECENT_ACTIVITY_LIMIT = 6;

/**
 * Org home (KAN-25): org switcher, project switcher, env badge, member
 * list, and an invite form gated on `members.manage`. A visitor who isn't an
 * active member of this org gets a 404, not a 403 — the KAN-26 "404 not 403"
 * non-enumeration principle applies even before that story builds it out
 * everywhere else.
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

  const principal = { type: 'user' as const, id: user.id };
  const canViewAuditLog = can(bindings, principal, 'audit.read', { orgId });
  const [projects, members, auditEntries] = await Promise.all([
    listOrgProjects(orgId),
    listOrgMembers(orgId),
    canViewAuditLog ? listAuditLogEntriesForOrg(orgId, RECENT_ACTIVITY_LIMIT) : Promise.resolve([]),
  ]);
  const currentProjectId = projectIdParam ?? projects[0]?.id;
  const currentProject = projects.find((project) => project.id === currentProjectId);
  const currentEnv: Environment = envParam && isEnvironment(envParam) ? envParam : 'dev';

  const canManageMembers = can(bindings, principal, 'members.manage', { orgId });
  const canManageProjects = can(bindings, principal, 'project.manage', { orgId });
  const canManageBilling = can(bindings, principal, 'billing.manage', { orgId });
  // The quick links open pages of the selected project, and each of those pages checks its
  // permission at project scope - so check them the same way here. An org-scoped binding still
  // covers every project; a project-scoped one (e.g. a project_admin) now sees its own project's
  // links instead of only the resources link.
  const projectScope = currentProjectId ? { orgId, projectId: currentProjectId } : { orgId };
  const canManageProjectSettings = can(bindings, principal, 'project.manage', projectScope);
  const canManageKeys = can(bindings, principal, 'keys.manage', projectScope);
  const canManageSchemas = can(bindings, principal, 'schema.write', projectScope);
  const canManageMetrics = can(bindings, principal, 'metrics.write', projectScope);
  const canViewIngestHealth = can(bindings, principal, 'ingest.write', projectScope);
  const canManagePlugins = can(bindings, principal, 'plugin.install', projectScope);
  const canManageBoards = can(bindings, principal, 'dashboards.write', projectScope);
  const canViewBoards = can(bindings, principal, 'dashboards.read', projectScope) || canManageBoards;

  // Projects the signed-in inviter administers (KAN-135) — scopes the
  // invite form's project picker to only the projects a project-scoped
  // invite (`project_admin`/`editor`/`operator`) could actually target. An
  // org-scope `project.manage` binding (e.g. `canManageProjects` above)
  // covers every project, so this is a superset check per project rather
  // than reusing `canManageProjects` directly.
  const administeredProjects = projects
    .filter((project) => can(bindings, principal, 'project.manage', { orgId, projectId: project.id }))
    .map((project) => ({ id: project.id, name: project.name }));

  // The selected project's live health, read under the viewer's own per-project permissions (the
  // same card the dashboard shows).
  const now = Date.now();
  const currentProjectCard = currentProject
    ? await loadDashboardProject({ orgId, project: currentProject, userId: user.id, bindings, now })
    : null;

  const [t, tShell] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('AppShell'),
  ]);

  // Restored pre-tri-module-redesign per-feature quick links (see
  // `ProjectLayout`'s own doc comment for why: the redesign dropped these
  // from every project-scoped nav surface, including this one, leaving the
  // pages themselves fully working but unreachable — and every e2e spec
  // that signs up, creates a project, and clicks a feature by name does so
  // from this org page, not from inside a project route). Grouped by what
  // they are for, each group only when the viewer can open something in it.
  type QuickLink = { href: string; label: string };
  const quickLinkGroups: { key: string; title: string; icon: LucideIcon; links: QuickLink[] }[] = currentProjectId
    ? [
        {
          key: 'data',
          title: t('groupData'),
          icon: Database,
          links: [
            { href: 'resources', label: t('projectResourcesLink') },
            ...(canManageKeys ? [{ href: 'keys', label: t('projectKeysLink') }] : []),
            ...(canManageSchemas ? [{ href: 'schema-defs', label: t('projectSchemaRegistryLink') }] : []),
            ...(canManageMetrics ? [{ href: 'metric-defs', label: t('projectMetricRegistryLink') }] : []),
            ...(canViewIngestHealth
              ? [
                  { href: 'ingest-health', label: t('projectIngestHealthLink') },
                  { href: 'hooks', label: t('projectHooksLink') },
                  { href: 'field-mappings', label: t('projectFieldMappingsLink') },
                  { href: 'billing-ops-feed', label: t('projectBillingOpsFeedLink') },
                  { href: 'record-feed', label: t('projectRecordFeedLink') },
                ]
              : []),
          ],
        },
        {
          key: 'customers',
          title: t('groupCustomers'),
          icon: Users,
          links: canViewIngestHealth
            ? [
                { href: 'customers', label: t('projectCustomersLink') },
                { href: 'feedback', label: t('projectFeedbackLink') },
                { href: 'churn-reasons', label: t('projectChurnReasonsLink') },
                { href: 'intent-quality', label: t('projectIntentQualityLink') },
                { href: 'firmographics', label: t('projectFirmographicsLink') },
                { href: 'experiments', label: t('projectExperimentsLink') },
              ]
            : [],
        },
        {
          key: 'analytics',
          title: t('groupAnalytics'),
          icon: PieChart,
          links: [
            ...(canViewBoards ? [{ href: 'boards', label: t('projectBoardsLink') }] : []),
            ...(canManageBoards
              ? [
                  { href: 'goals', label: t('projectGoalsLink') },
                  { href: 'segments', label: t('projectSegmentsLink') },
                  { href: 'funnel', label: t('projectFunnelLink') },
                  { href: 'cohorts', label: t('projectCohortsLink') },
                  { href: 'insights', label: t('projectInsightsLink') },
                  { href: 'tv', label: t('projectTvLink') },
                  { href: 'campaign-ops', label: t('projectCampaignOpsLink') },
                ]
              : []),
          ],
        },
        {
          key: 'admin',
          title: t('groupAdmin'),
          icon: Wrench,
          links: [
            ...(canManageProjectSettings
              ? [
                  { href: 'cost-guardrails', label: t('projectCostGuardrailsLink') },
                  { href: 'session-replay', label: t('projectSessionReplayLink') },
                  { href: 'settings', label: t('projectSettingsLink') },
                ]
              : []),
            ...(canManagePlugins ? [{ href: 'plugins', label: t('projectPluginsLink') }] : []),
          ],
        },
      ]
        .map((group) => ({ ...group, links: group.links.map((item) => ({ href: `/orgs/${orgId}/projects/${currentProjectId}/${item.href}`, label: item.label })) }))
        .filter((group) => group.links.length > 0)
    : [];

  const moduleLinks = currentProjectId
    ? [
        { href: 'campaigns', label: tShell('adsAndPerformance'), icon: Megaphone },
        { href: 'funnel', label: tShell('funnelAndGoals'), icon: Target },
        { href: 'automation', label: tShell('aiCopilotAndAutomation'), icon: Bot },
        { href: 'settings', label: tShell('settings'), icon: Settings },
      ]
    : [];

  const activeMembers = members.filter((member) => isActiveMembershipStatus(member.status));
  const invitedMembers = members.filter((member) => member.status === 'invited');
  const adminCount = activeMembers.filter((member) => member.role === 'org_owner' || member.role === 'org_admin').length;
  const roleMix = topCounts(activeMembers.map((member) => member.role));
  const numberFormat = new Intl.NumberFormat(locale);
  const dateTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const recentActivity = auditEntries.map(toAuditLogEntryView);

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero
          icon={Building2}
          eyebrow={t('eyebrow')}
          title={membership.organizationName}
          description={t('heroDescription')}
          actions={
            <>
              {canManageProjects ? (
                <Button asChild size="sm">
                  <Link href={`/orgs/${orgId}/projects/new`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t('newProject')}
                  </Link>
                </Button>
              ) : null}
              {canManageBilling ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/orgs/${orgId}/settings`}>
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    {t('orgSettingsLink')}
                  </Link>
                </Button>
              ) : null}
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title={t('kpiProjects')} value={numberFormat.format(projects.length)} icon={FolderKanban} />
            <StatCard title={t('kpiMembers')} value={numberFormat.format(activeMembers.length)} icon={Users} />
            <StatCard title={t('kpiInvited')} value={numberFormat.format(invitedMembers.length)} icon={Mail} />
            <StatCard title={t('kpiAdmins')} value={numberFormat.format(adminCount)} icon={ShieldCheck} />
          </div>
        </PageHero>

        <ChartCard title={t('projectsHeading')} icon={FolderKanban}>
          {projects.length === 0 ? (
            <EmptyState
              compact
              icon={FolderKanban}
              title={t('noProjects')}
              description={canManageProjects ? t('noProjectsHint') : undefined}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <ProjectSwitcher orgId={orgId} projects={projects} currentProjectId={currentProjectId} currentEnv={currentEnv} />
              {currentProjectId ? (
                <div className="flex flex-wrap items-center gap-3">
                  <EnvBadge orgId={orgId} projectId={currentProjectId} currentEnv={currentEnv} />
                  <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                  {moduleLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={`/orgs/${orgId}/projects/${currentProjectId}/${item.href}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
              {quickLinkGroups.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {quickLinkGroups.map((group) => (
                    <div key={group.key} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <group.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {group.title}
                      </p>
                      <ul className="mt-3 flex flex-col gap-1">
                        {group.links.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className="block rounded-md px-2 py-1 text-sm text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </ChartCard>

        {currentProjectCard ? <ProjectHealthCard project={currentProjectCard} wide /> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title={t('membersHeading')} icon={Users}>
            <div className="flex flex-col gap-4">
              <MembersList
                orgId={orgId}
                members={members}
                canManageMembers={canManageMembers}
                projects={projects.map((project) => ({ id: project.id, name: project.name }))}
              />
              {canManageMembers ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t('inviteHeading')}
                  </p>
                  <InviteMemberForm orgId={orgId} administeredProjects={administeredProjects} />
                </div>
              ) : null}
            </div>
          </ChartCard>
          <div className="flex flex-col gap-6">
            <ChartCard title={t('teamMixTitle')} description={t('teamMixDescription')} icon={PieChart}>
              {roleMix.length === 0 ? (
                <EmptyState compact icon={Users} title={t('teamMixEmpty')} />
              ) : (
                <DonutChart
                  label={t('teamMixTitle')}
                  centerValue={numberFormat.format(activeMembers.length)}
                  centerLabel={t('teamMixCenter')}
                  data={roleMix.map((entry) => ({ label: entry.key, value: entry.count }))}
                  size={150}
                  layout="stacked"
                />
              )}
            </ChartCard>
            {canViewAuditLog ? (
              <ChartCard
                title={t('recentActivityTitle')}
                icon={History}
                footer={
                  <Link href={`/orgs/${orgId}/audit-log`} className="font-medium text-primary hover:underline">
                    {t('recentActivityAll')}
                  </Link>
                }
              >
                {recentActivity.length === 0 ? (
                  <EmptyState compact icon={History} title={t('recentActivityEmpty')} />
                ) : (
                  <Timeline
                    label={t('recentActivityTitle')}
                    groups={[
                      {
                        key: 'recent',
                        label: t('recentActivityLatest'),
                        items: recentActivity.map((entry) => {
                          const category = auditActionCategory(entry.action);
                          const actor = memberByUserId.get(entry.actorId);
                          return {
                            key: entry.id,
                            icon: AUDIT_CATEGORY_ICONS[category],
                            tone: AUDIT_CATEGORY_TONES[category],
                            leading: <InitialsAvatar name={actor?.displayName || actor?.email || entry.actorId} seed={entry.actorId} size="sm" />,
                            title: (
                              <span className="line-clamp-2" dir="ltr">
                                {entry.summary}
                              </span>
                            ),
                            time: Number.isNaN(Date.parse(entry.createdAt)) ? entry.createdAt : dateTimeFormat.format(new Date(entry.createdAt)),
                          };
                        }),
                      },
                    ]}
                  />
                )}
              </ChartCard>
            ) : null}
          </div>
        </div>
      </main>
    </OrgShell>
  );
}

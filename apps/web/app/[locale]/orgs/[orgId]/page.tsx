import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { OrgShell } from '@/components/orgs/org-shell';
import { ProjectSwitcher } from '@/components/orgs/project-switcher';
import { EnvBadge } from '@/components/orgs/env-badge';
import { MembersList } from '@/components/orgs/members-list';
import { InviteMemberForm } from '@/components/orgs/invite-member-form';
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

  const [projects, members] = await Promise.all([listOrgProjects(orgId), listOrgMembers(orgId)]);
  const currentProjectId = projectIdParam ?? projects[0]?.id;
  const currentEnv: Environment = envParam && isEnvironment(envParam) ? envParam : 'dev';

  const principal = { type: 'user' as const, id: user.id };
  const canManageMembers = can(bindings, principal, 'members.manage', { orgId });
  const canManageProjects = can(bindings, principal, 'project.manage', { orgId });
  const canManageBilling = can(bindings, principal, 'billing.manage', { orgId });
  const canManageKeys = can(bindings, principal, 'keys.manage', { orgId });
  const canManageSchemas = can(bindings, principal, 'schema.write', { orgId });
  const canManageMetrics = can(bindings, principal, 'metrics.write', { orgId });
  const canViewIngestHealth = can(bindings, principal, 'ingest.write', { orgId });
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });
  const canViewBoards = can(bindings, principal, 'dashboards.read', { orgId }) || canManageBoards;

  // Projects the signed-in inviter administers (KAN-135) — scopes the
  // invite form's project picker to only the projects a project-scoped
  // invite (`project_admin`/`editor`/`operator`) could actually target. An
  // org-scope `project.manage` binding (e.g. `canManageProjects` above)
  // covers every project, so this is a superset check per project rather
  // than reusing `canManageProjects` directly.
  const administeredProjects = projects
    .filter((project) => can(bindings, principal, 'project.manage', { orgId, projectId: project.id }))
    .map((project) => ({ id: project.id, name: project.name }));

  const [t, tShell] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('AppShell'),
  ]);

  // Restored pre-tri-module-redesign per-feature quick links (see
  // `ProjectLayout`'s own doc comment for why: the redesign dropped these
  // from every project-scoped nav surface, including this one, leaving the
  // pages themselves fully working but unreachable — and every e2e spec
  // that signs up, creates a project, and clicks a feature by name does so
  // from this org page, not from inside a project route). `campaigns`/
  // `funnel`/`automation`/`settings` are already covered above by the 3
  // primary-module links plus the org-settings link; not repeated here
  // except `funnel`/`settings`, which the pre-redesign page linked under
  // different labels ("Conversion"/"Project settings") that some specs
  // click by name.
  const projectQuickLinks: { href: string; label: string }[] = currentProjectId
    ? [
        { href: `${currentProjectId}/resources`, label: t('projectResourcesLink') },
        ...(canManageKeys ? [{ href: `${currentProjectId}/keys`, label: t('projectKeysLink') }] : []),
        ...(canManageSchemas
          ? [{ href: `${currentProjectId}/schema-defs`, label: t('projectSchemaRegistryLink') }]
          : []),
        ...(canManageMetrics
          ? [{ href: `${currentProjectId}/metric-defs`, label: t('projectMetricRegistryLink') }]
          : []),
        ...(canViewIngestHealth
          ? [
              { href: `${currentProjectId}/ingest-health`, label: t('projectIngestHealthLink') },
              { href: `${currentProjectId}/hooks`, label: t('projectHooksLink') },
              { href: `${currentProjectId}/field-mappings`, label: t('projectFieldMappingsLink') },
              { href: `${currentProjectId}/billing-ops-feed`, label: t('projectBillingOpsFeedLink') },
              { href: `${currentProjectId}/record-feed`, label: t('projectRecordFeedLink') },
              { href: `${currentProjectId}/customers`, label: t('projectCustomersLink') },
              { href: `${currentProjectId}/feedback`, label: t('projectFeedbackLink') },
              { href: `${currentProjectId}/churn-reasons`, label: t('projectChurnReasonsLink') },
              { href: `${currentProjectId}/intent-quality`, label: t('projectIntentQualityLink') },
              { href: `${currentProjectId}/firmographics`, label: t('projectFirmographicsLink') },
              { href: `${currentProjectId}/experiments`, label: t('projectExperimentsLink') },
            ]
          : []),
        ...(canManageProjects
          ? [
              { href: `${currentProjectId}/cost-guardrails`, label: t('projectCostGuardrailsLink') },
              { href: `${currentProjectId}/session-replay`, label: t('projectSessionReplayLink') },
              { href: `${currentProjectId}/settings`, label: t('projectSettingsLink') },
            ]
          : []),
        ...(canManagePlugins ? [{ href: `${currentProjectId}/plugins`, label: t('projectPluginsLink') }] : []),
        ...(canViewBoards ? [{ href: `${currentProjectId}/boards`, label: t('projectBoardsLink') }] : []),
        ...(canManageBoards
          ? [
              { href: `${currentProjectId}/goals`, label: t('projectGoalsLink') },
              { href: `${currentProjectId}/segments`, label: t('projectSegmentsLink') },
              { href: `${currentProjectId}/funnel`, label: t('projectFunnelLink') },
              { href: `${currentProjectId}/cohorts`, label: t('projectCohortsLink') },
              { href: `${currentProjectId}/insights`, label: t('projectInsightsLink') },
              { href: `${currentProjectId}/tv`, label: t('projectTvLink') },
              { href: `${currentProjectId}/campaign-ops`, label: t('projectCampaignOpsLink') },
            ]
          : []),
      ].map((item) => ({ href: `/orgs/${orgId}/projects/${item.href}`, label: item.label }))
    : [];

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">{membership.organizationName}</h1>
          {canManageBilling ? (
            <Link className="text-sm underline" href={`/orgs/${orgId}/settings`}>
              {t('orgSettingsLink')}
            </Link>
          ) : null}
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('projectsHeading')}</h2>
            {canManageProjects ? (
              <Link className="text-sm underline" href={`/orgs/${orgId}/projects/new`}>
                {t('newProject')}
              </Link>
            ) : null}
          </div>
          {projects.length === 0 ? (
            <p className="text-muted-foreground">{t('noProjects')}</p>
          ) : (
            <>
              <ProjectSwitcher
                orgId={orgId}
                projects={projects}
                currentProjectId={currentProjectId}
                currentEnv={currentEnv}
              />
              {currentProjectId ? (
                <div className="flex items-center gap-4">
                  <EnvBadge orgId={orgId} projectId={currentProjectId} currentEnv={currentEnv} />
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/campaigns`}>
                    {tShell('adsAndPerformance')}
                  </Link>
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/funnel`}>
                    {tShell('funnelAndGoals')}
                  </Link>
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/automation`}>
                    {tShell('aiCopilotAndAutomation')}
                  </Link>
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/settings`}>
                    {tShell('settings')}
                  </Link>
                </div>
              ) : null}
              {projectQuickLinks.length > 0 ? (
                <div className="flex flex-wrap items-center gap-4">
                  {projectQuickLinks.map((item) => (
                    <Link key={item.href} className="text-sm underline" href={item.href}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('membersHeading')}</h2>
          <MembersList
            orgId={orgId}
            members={members}
            canManageMembers={canManageMembers}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          />
          {canManageMembers ? (
            <InviteMemberForm orgId={orgId} administeredProjects={administeredProjects} />
          ) : null}
        </section>
      </main>
    </OrgShell>
  );
}

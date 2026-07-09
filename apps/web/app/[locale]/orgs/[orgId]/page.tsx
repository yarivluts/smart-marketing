import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, isEnvironment, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { OrgSwitcher } from '@/components/orgs/org-switcher';
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
export default async function OrgDetailPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
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
  const canManageKeys = can(bindings, principal, 'keys.manage', { orgId });
  const canManageSchemas = can(bindings, principal, 'schema.write', { orgId });
  const canManageMetrics = can(bindings, principal, 'metrics.write', { orgId });
  const canViewIngestHealth = can(bindings, principal, 'ingest.write', { orgId });
  const canViewAuditLog = can(bindings, principal, 'audit.read', { orgId });
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });

  const t = await getTranslations('OrgDetailPage');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{membership.organizationName}</h1>
        <div className="flex items-center gap-4">
          <Link className="text-sm underline" href={`/orgs/${orgId}/resources`}>
            {t('resourceLibraryLink')}
          </Link>
          {canViewAuditLog ? (
            <Link className="text-sm underline" href={`/orgs/${orgId}/audit-log`}>
              {t('auditLogLink')}
            </Link>
          ) : null}
          {canManagePlugins ? (
            <Link className="text-sm underline" href={`/orgs/${orgId}/plugins`}>
              {t('pluginRegistryLink')}
            </Link>
          ) : null}
          <OrgSwitcher memberships={memberships} currentOrgId={orgId} />
        </div>
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
                <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/resources`}>
                  {t('projectResourcesLink')}
                </Link>
                {canManageKeys ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/keys`}>
                    {t('projectKeysLink')}
                  </Link>
                ) : null}
                {canManageSchemas ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/schema-defs`}>
                    {t('projectSchemaRegistryLink')}
                  </Link>
                ) : null}
                {canManageMetrics ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/metric-defs`}>
                    {t('projectMetricRegistryLink')}
                  </Link>
                ) : null}
                {canViewIngestHealth ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/ingest-health`}>
                    {t('projectIngestHealthLink')}
                  </Link>
                ) : null}
                {canManageProjects ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/cost-guardrails`}>
                    {t('projectCostGuardrailsLink')}
                  </Link>
                ) : null}
                {canManagePlugins ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/plugins`}>
                    {t('projectPluginsLink')}
                  </Link>
                ) : null}
                {canManageBoards ? (
                  <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${currentProjectId}/boards`}>
                    {t('projectBoardsLink')}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('membersHeading')}</h2>
        <MembersList orgId={orgId} members={members} canManageMembers={canManageMembers} />
        {canManageMembers ? <InviteMemberForm orgId={orgId} /> : null}
      </section>
    </main>
  );
}

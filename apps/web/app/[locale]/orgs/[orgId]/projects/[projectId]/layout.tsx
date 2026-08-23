import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { can } from '@growthos/shared';
import {
  AppShell,
  type AppShellNavItem,
  type AppShellNavSection,
} from '@/components/orgs/app-shell';
import { OmniSearchTrigger } from '@/components/orgs/omni-search';
import { ProjectSwitcher } from '@/components/orgs/project-switcher';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * The persistent shell for every project-level page — see `AppShell`'s own
 * doc comment. Same "chrome only, each page keeps its own gate" posture as
 * the org-level layout; nav items are pre-filtered by the same permissions
 * each destination page itself checks; the onboarding wizard is deliberately
 * excluded (a one-time flow, not a persistent nav destination).
 *
 * The project switcher here still navigates back to the org home with
 * `?project=` set (the switcher's existing, pre-shell behavior) rather than
 * jumping to the same sub-page in the newly selected project — staying on
 * the same relative sub-route across projects would need the switcher
 * rebuilt to accept a "current sub-path" and isn't done here.
 */
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const principal = { type: 'user' as const, id: user.id };
  const canManageKeys = can(bindings, principal, 'keys.manage', { orgId });
  const canManageSchemas = can(bindings, principal, 'schema.write', { orgId });
  const canManageMetrics = can(bindings, principal, 'metrics.write', { orgId });
  const canViewIngestHealth = can(bindings, principal, 'ingest.write', { orgId });
  const canManageProjects = can(bindings, principal, 'project.manage', { orgId });
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });
  const canViewBoards = can(bindings, principal, 'dashboards.read', { orgId }) || canManageBoards;
  const canRunAutomation = can(bindings, principal, 'automation.execute', { orgId });
  const canViewAuditLog = can(bindings, principal, 'audit.read', { orgId });

  const [t, tAutomation, tWinRules, tShell] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('Automation'),
    getTranslations('WinRules'),
    getTranslations('AppShell'),
  ]);

  const base = `/orgs/${orgId}/projects/${projectId}`;

  // Org-level destinations (Home/Resources/Audit log/Plugin registry) — the org-only pages
  // (`orgs/[orgId]/page.tsx` etc.) render their own equivalent shell via `OrgShell`, but a project
  // page needs its own copy of these too since `layout.tsx` files nest: this layout is the *only*
  // shell-provider for anything under `projects/[projectId]/*` (see `OrgShell`'s doc comment for why
  // stacking a second full `AppShell` here would double the chrome instead of extending it).
  const orgItems: AppShellNavItem[] = [
    { href: `/orgs/${orgId}`, label: tShell('homeLink'), icon: 'Home' },
    { href: `/orgs/${orgId}/resources`, label: t('resourceLibraryLink'), icon: 'FolderOpen' },
    ...(canViewAuditLog
      ? [
          {
            href: `/orgs/${orgId}/audit-log`,
            label: t('auditLogLink'),
            icon: 'ShieldCheck' as const,
          },
        ]
      : []),
    ...(canManagePlugins
      ? [
          {
            href: `/orgs/${orgId}/plugins`,
            label: t('pluginRegistryLink'),
            icon: 'Puzzle' as const,
          },
        ]
      : []),
  ];

  const insightsItems: AppShellNavItem[] = [
    // `dashboards.read` gates Boards on its own (a `viewer` should see this) — Goals/Segments/
    // Win rules/War-room TV still gate on the write permission only, unchanged: only Boards was
    // asked to become viewer-visible (session-B dogfooding QA, 2026-08-18), not the whole section.
    ...(canViewBoards ? [{ href: `${base}/boards`, label: t('projectBoardsLink'), icon: 'LayoutGrid' as const }] : []),
    ...(canManageBoards
      ? [
          { href: `${base}/goals`, label: t('projectGoalsLink'), icon: 'Target' as const },
          { href: `${base}/segments`, label: t('projectSegmentsLink'), icon: 'Users' as const },
          { href: `${base}/win-rules`, label: tWinRules('metaTitle'), icon: 'Trophy' as const },
          { href: `${base}/tv`, label: t('projectTvLink'), icon: 'Tv' as const },
        ]
      : []),
  ];

  const dataItems: AppShellNavItem[] = [
    ...(canManageSchemas
      ? [
          {
            href: `${base}/schema-defs`,
            label: t('projectSchemaRegistryLink'),
            icon: 'Database' as const,
          },
        ]
      : []),
    ...(canManageMetrics
      ? [
          {
            href: `${base}/metric-defs`,
            label: t('projectMetricRegistryLink'),
            icon: 'BarChart3' as const,
          },
        ]
      : []),
    ...(canViewIngestHealth
      ? [
          {
            href: `${base}/ingest-health`,
            label: t('projectIngestHealthLink'),
            icon: 'Activity' as const,
          },
          { href: `${base}/hooks`, label: t('projectHooksLink'), icon: 'Webhook' as const },
          {
            href: `${base}/field-mappings`,
            label: t('projectFieldMappingsLink'),
            icon: 'GitBranch' as const,
          },
          {
            href: `${base}/billing-ops-feed`,
            label: t('projectBillingOpsFeedLink'),
            icon: 'Receipt' as const,
          },
          {
            href: `${base}/record-feed`,
            label: t('projectRecordFeedLink'),
            icon: 'Rows3' as const,
          },
          {
            href: `${base}/feedback`,
            label: t('projectFeedbackLink'),
            icon: 'MessageSquare' as const,
          },
          {
            href: `${base}/churn-reasons`,
            label: t('projectChurnReasonsLink'),
            icon: 'UserX' as const,
          },
        ]
      : []),
  ];

  const automationItems: AppShellNavItem[] = [
    ...(canManagePlugins
      ? [{ href: `${base}/plugins`, label: t('projectPluginsLink'), icon: 'Puzzle' as const }]
      : []),
    ...(canRunAutomation
      ? [{ href: `${base}/automation`, label: tAutomation('metaTitle'), icon: 'Bot' as const }]
      : []),
  ];

  const settingsItems: AppShellNavItem[] = [
    { href: `${base}/resources`, label: t('projectResourcesLink'), icon: 'FolderOpen' },
    ...(canManageKeys
      ? [{ href: `${base}/keys`, label: t('projectKeysLink'), icon: 'KeyRound' as const }]
      : []),
    ...(canManageProjects
      ? [
          {
            href: `${base}/cost-guardrails`,
            label: t('projectCostGuardrailsLink'),
            icon: 'Gauge' as const,
          },
          {
            href: `${base}/session-replay`,
            label: t('projectSessionReplayLink'),
            icon: 'Video' as const,
          },
        ]
      : []),
  ];

  const sections: AppShellNavSection[] = [
    { items: orgItems },
    { items: insightsItems },
    { heading: tShell('dataSection'), items: dataItems },
    { heading: tShell('automationSection'), items: automationItems },
    { heading: tShell('settingsSection'), items: settingsItems },
  ].filter((section) => section.items.length > 0);

  const mobileTabItems = [
    ...insightsItems.slice(0, 3),
    ...automationItems.slice(0, 1),
    ...settingsItems.slice(0, 1),
  ].slice(0, 5);

  return (
    <AppShell
      switchers={
        <>
          <span className="truncate px-3 text-sm font-semibold">{project.name}</span>
          <ProjectSwitcher
            orgId={orgId}
            projects={projects}
            currentProjectId={projectId}
            currentEnv="dev"
          />
        </>
      }
      omniSearch={<OmniSearchTrigger orgId={orgId} projectId={projectId} />}
      sections={sections}
      mobileTabItems={mobileTabItems}
    >
      {children}
    </AppShell>
  );
}

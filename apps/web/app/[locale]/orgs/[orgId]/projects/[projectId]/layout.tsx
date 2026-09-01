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
import { buildOmniSearchPageShortcuts } from '@/lib/orgs/omnisearch';
import { listOrgProjects } from '@/lib/orgs/queries';

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * The persistent shell for every project-level page — see `AppShell`'s own
 * doc comment. Leads with the 3 primary modules (Ads & Performance, Funnel &
 * Goals, AI Copilot & Automation) the tri-module redesign introduced, then
 * restores every pre-redesign per-feature nav item below them (same
 * permission gates, translation keys, and hrefs as before that redesign) so
 * every admin surface stays reachable from the sidebar — the redesign had
 * dropped these links while leaving the pages themselves fully working,
 * which both violated CLAUDE.md's "everything user-manageable gets an admin
 * surface" rule and broke every e2e spec that clicks a feature by name (see
 * PROGRESS.md's 2026-08-31 entries). `campaigns`/`automation` are
 * deliberately not re-added standalone — they'd just be a second link to the
 * same href the primary modules above already cover.
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
  const canViewAuditLog = can(bindings, principal, 'audit.read', { orgId });

  const [t, tWinRules, tShell] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('WinRules'),
    getTranslations('AppShell'),
  ]);

  const base = `/orgs/${orgId}/projects/${projectId}`;

  const primaryModuleItems: AppShellNavItem[] = [
    {
      href: `${base}/campaigns`,
      label: tShell('adsAndPerformance'),
      icon: 'Megaphone',
    },
    {
      href: `${base}/funnel`,
      label: tShell('funnelAndGoals'),
      icon: 'Target',
    },
    {
      href: `${base}/automation`,
      label: tShell('aiCopilotAndAutomation'),
      icon: 'Bot',
    },
  ];

  // Restored pre-redesign items — see the module doc comment above.
  const orgItems: AppShellNavItem[] = [
    { href: `/orgs/${orgId}`, label: tShell('homeLink'), icon: 'Home' },
    { href: `/orgs/${orgId}/resources`, label: t('resourceLibraryLink'), icon: 'FolderOpen' },
    ...(canViewAuditLog
      ? [{ href: `/orgs/${orgId}/audit-log`, label: t('auditLogLink'), icon: 'ShieldCheck' as const }]
      : []),
    ...(canManagePlugins
      ? [{ href: `/orgs/${orgId}/plugins`, label: t('pluginRegistryLink'), icon: 'Puzzle' as const }]
      : []),
  ];

  const insightsItems: AppShellNavItem[] = [
    ...(canViewBoards
      ? [{ href: `${base}/boards`, label: t('projectBoardsLink'), icon: 'LayoutGrid' as const }]
      : []),
    ...(canManageBoards
      ? [
          { href: `${base}/goals`, label: t('projectGoalsLink'), icon: 'Target' as const },
          { href: `${base}/segments`, label: t('projectSegmentsLink'), icon: 'Users' as const },
          { href: `${base}/win-rules`, label: tWinRules('metaTitle'), icon: 'Trophy' as const },
          { href: `${base}/funnel`, label: t('projectFunnelLink'), icon: 'Filter' as const },
          { href: `${base}/cohorts`, label: t('projectCohortsLink'), icon: 'Grid3x3' as const },
          { href: `${base}/insights`, label: t('projectInsightsLink'), icon: 'Bell' as const },
          { href: `${base}/tv`, label: t('projectTvLink'), icon: 'Tv' as const },
          { href: `${base}/campaign-ops`, label: t('projectCampaignOpsLink'), icon: 'TrendingUp' as const },
          { href: `${base}/rep-collections`, label: t('projectRepCollectionsLink'), icon: 'Award' as const },
        ]
      : []),
  ];

  const dataItems: AppShellNavItem[] = [
    ...(canManageSchemas
      ? [{ href: `${base}/schema-defs`, label: t('projectSchemaRegistryLink'), icon: 'Database' as const }]
      : []),
    ...(canManageMetrics
      ? [{ href: `${base}/metric-defs`, label: t('projectMetricRegistryLink'), icon: 'BarChart3' as const }]
      : []),
    ...(canViewIngestHealth
      ? [
          { href: `${base}/ingest-health`, label: t('projectIngestHealthLink'), icon: 'Activity' as const },
          { href: `${base}/hooks`, label: t('projectHooksLink'), icon: 'Webhook' as const },
          { href: `${base}/field-mappings`, label: t('projectFieldMappingsLink'), icon: 'GitBranch' as const },
          { href: `${base}/billing-ops-feed`, label: t('projectBillingOpsFeedLink'), icon: 'Receipt' as const },
          { href: `${base}/record-feed`, label: t('projectRecordFeedLink'), icon: 'Rows3' as const },
          { href: `${base}/customers`, label: t('projectCustomersLink'), icon: 'Search' as const },
          { href: `${base}/feedback`, label: t('projectFeedbackLink'), icon: 'MessageSquare' as const },
          { href: `${base}/churn-reasons`, label: t('projectChurnReasonsLink'), icon: 'UserX' as const },
          { href: `${base}/intent-quality`, label: t('projectIntentQualityLink'), icon: 'Gauge' as const },
          { href: `${base}/firmographics`, label: t('projectFirmographicsLink'), icon: 'Building2' as const },
          { href: `${base}/experiments`, label: t('projectExperimentsLink'), icon: 'FlaskConical' as const },
          { href: `${base}/support`, label: t('projectSupportLink'), icon: 'Headset' as const },
          { href: `${base}/demos`, label: t('projectDemosLink'), icon: 'Presentation' as const },
        ]
      : []),
  ];

  const restoredAutomationItems: AppShellNavItem[] = [
    ...(canManagePlugins
      ? [{ href: `${base}/plugins`, label: t('projectPluginsLink'), icon: 'Puzzle' as const }]
      : []),
  ];

  const secondaryItems: AppShellNavItem[] = [
    {
      href: `${base}/settings`,
      label: tShell('settings'),
      icon: 'Settings',
    },
    { href: `${base}/resources`, label: t('projectResourcesLink'), icon: 'FolderOpen' },
    ...(canManageKeys
      ? [{ href: `${base}/keys`, label: t('projectKeysLink'), icon: 'KeyRound' as const }]
      : []),
    ...(canManageProjects
      ? [
          { href: `${base}/cost-guardrails`, label: t('projectCostGuardrailsLink'), icon: 'Gauge' as const },
          { href: `${base}/session-replay`, label: t('projectSessionReplayLink'), icon: 'Video' as const },
        ]
      : []),
  ];

  const sections: AppShellNavSection[] = [
    { items: primaryModuleItems },
    { items: orgItems },
    { items: insightsItems },
    { heading: tShell('dataSection'), items: dataItems },
    { heading: tShell('automationSection'), items: restoredAutomationItems },
    { heading: tShell('settingsSection'), items: secondaryItems },
  ].filter((section) => section.items.length > 0);

  const mobileTabItems: AppShellNavItem[] = [
    ...primaryModuleItems,
    { href: `${base}/settings`, label: tShell('settings'), icon: 'Settings' },
  ];

  // KAN-85 follow-up: every restored nav item above also becomes a "jump to
  // this page" omnisearch result, not just the pre-existing per-entity index
  // (see `buildOmniSearchPageShortcuts`'s own doc comment). Deliberately
  // excludes `primaryModuleItems` — those 3 links were never dropped, so
  // they're already one click away everywhere and don't need a search
  // shortcut of their own.
  const pageShortcuts = buildOmniSearchPageShortcuts([
    ...orgItems,
    ...insightsItems,
    ...dataItems,
    ...restoredAutomationItems,
    ...secondaryItems,
  ]);

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
      omniSearch={<OmniSearchTrigger orgId={orgId} projectId={projectId} pageShortcuts={pageShortcuts} />}
      sections={sections}
      mobileTabItems={mobileTabItems}
    >
      {children}
    </AppShell>
  );
}

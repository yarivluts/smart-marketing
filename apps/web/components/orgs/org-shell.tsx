import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@growthos/shared';
import { NavShell } from '@/components/shell/nav-shell';
import type { NavShellItem, NavShellSection } from '@/components/shell/nav-types';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';

export interface OrgShellProps {
  locale: string;
  orgId: string;
  children: React.ReactNode;
}

/**
 * The persistent shell for the org-only pages (`/orgs/:orgId`, `/resources`,
 * `/audit-log`, `/plugins`, `/settings`, `/projects/new`).
 *
 * Renders the same Stitch "Pastel Pulse" `NavShell` (top bar, sidebar, mobile
 * drawer + obsidian dock) as `ProjectLayout`, so moving between org and
 * project pages no longer swaps between two different chromes.
 *
 * Deliberately a plain component each page calls directly, **not** a Next.js
 * `layout.tsx`: `layout.tsx` files nest with every descendant route,
 * including `projects/[projectId]/*` — an org-level `layout.tsx` here would
 * wrap the project layout's own shell too, stacking two full shells on every
 * project page (found live: a doubled mobile header).
 *
 * Duplicates the same auth/membership check every page under it already
 * makes — `getServerSession`/`resolveOrgSessionContext` are both `cache()`d,
 * so this doesn't cost a second Firestore round trip within the request.
 */
export async function OrgShell({
  locale,
  orgId,
  children,
}: OrgShellProps): Promise<React.ReactElement> {
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
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });
  const canManageOrg = can(bindings, principal, 'billing.manage', { orgId });

  const [t, tShell, tNav, projects] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('AppShell'),
    getTranslations('OrgNav'),
    listOrgProjects(orgId),
  ]);

  const items: NavShellItem[] = [
    { id: 'org-home', href: `/orgs/${orgId}`, label: tShell('homeLink'), icon: 'Home' },
    { id: 'org-resources', href: `/orgs/${orgId}/resources`, label: t('resourceLibraryLink'), icon: 'FolderOpen' },
    ...(canViewAuditLog
      ? [{ id: 'org-audit', href: `/orgs/${orgId}/audit-log`, label: t('auditLogLink'), icon: 'ShieldCheck' as const }]
      : []),
    ...(canManagePlugins
      ? [{ id: 'org-plugins', href: `/orgs/${orgId}/plugins`, label: t('pluginRegistryLink'), icon: 'Puzzle' as const }]
      : []),
    ...(canManageOrg
      ? [{ id: 'org-settings', href: `/orgs/${orgId}/settings`, label: tNav('settings'), icon: 'Settings' as const }]
      : []),
  ];

  const projectItems: NavShellItem[] = projects.map((p) => ({
    id: `org-project-${p.id}`,
    href: `/orgs/${orgId}/projects/${p.id}`,
    label: p.name,
    icon: 'LayoutGrid' as const,
  }));

  const sections: NavShellSection[] = [
    { heading: tNav('organizationHeading'), items },
    ...(projectItems.length > 0 ? [{ heading: tNav('projectsHeading'), items: projectItems }] : []),
  ];

  const organizations = memberships
    .filter((m) => m.status === 'active')
    .map((m) => ({ id: m.organizationId, name: m.organizationName }));

  return (
    <NavShell
      brandName={tShell('brandName')}
      organizations={organizations}
      currentOrgId={orgId}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      userEmail={session.email ?? undefined}
      sections={sections}
      mobileTabItems={items.slice(0, 4)}
    >
      {children}
    </NavShell>
  );
}

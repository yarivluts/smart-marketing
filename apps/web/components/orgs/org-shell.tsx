import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { can } from '@growthos/shared';
import { AppShell, type AppShellNavItem } from '@/components/orgs/app-shell';
import { OrgSwitcher } from '@/components/orgs/org-switcher';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';

export interface OrgShellProps {
  locale: string;
  orgId: string;
  children: React.ReactNode;
}

/**
 * The persistent shell (sidebar / mobile top bar + tab bar) for the four
 * org-only pages (`/orgs/:orgId`, `/resources`, `/audit-log`, `/plugins`) —
 * see `AppShell`'s own doc comment for why this exists.
 *
 * Deliberately a plain component each page calls directly, **not** a Next.js
 * `layout.tsx`: `layout.tsx` files nest with every descendant route,
 * including `projects/[projectId]/*` — an org-level `layout.tsx` rendering
 * `AppShell` here would wrap the *project*-level layout's own `AppShell` too,
 * stacking two full shells on every project page (found live: a doubled
 * mobile header, and the bottom tab bar showing org-level items instead of
 * the project's). `ProjectLayout` (the one real `layout.tsx` in this tree)
 * builds its own merged org+project nav instead of relying on this one.
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

  const [t, tShell] = await Promise.all([
    getTranslations('OrgDetailPage'),
    getTranslations('AppShell'),
  ]);

  const items: AppShellNavItem[] = [
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

  return (
    <AppShell
      switchers={
        <>
          <span className="flex items-center gap-2 px-3 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            {tShell('brandName')}
          </span>
          <OrgSwitcher memberships={memberships} currentOrgId={orgId} />
        </>
      }
      sections={[{ items }]}
      mobileTabItems={items.slice(0, 4)}
    >
      {children}
    </AppShell>
  );
}

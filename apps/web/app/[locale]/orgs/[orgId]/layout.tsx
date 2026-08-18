import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { can } from '@growthos/shared';
import { AppShell, type AppShellNavItem } from '@/components/orgs/app-shell';
import { OrgSwitcher } from '@/components/orgs/org-switcher';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string; orgId: string }>;
}>;

/**
 * The persistent shell (sidebar / mobile top bar + tab bar) for every org-level
 * page (`/orgs/:orgId`, `/resources`, `/audit-log`, `/plugins`) — see
 * `AppShell`'s own doc comment for why this exists. `project.manage`-only
 * pages (`/projects/new` etc.) still render fine unwrapped-in-nav-terms since
 * a layout only supplies chrome, never gates access — each page keeps its own
 * auth/permission check, this just duplicates the minimal membership lookup
 * needed to decide which nav items to show.
 */
export default async function OrgLayout({ children, params }: LayoutProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
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
  const canManagePlugins = can(bindings, principal, 'plugin.install', { orgId });

  const [t, tShell] = await Promise.all([getTranslations('OrgDetailPage'), getTranslations('AppShell')]);

  const items: AppShellNavItem[] = [
    { href: `/orgs/${orgId}`, label: tShell('homeLink'), icon: 'Home' },
    { href: `/orgs/${orgId}/resources`, label: t('resourceLibraryLink'), icon: 'FolderOpen' },
    ...(canViewAuditLog ? [{ href: `/orgs/${orgId}/audit-log`, label: t('auditLogLink'), icon: 'ShieldCheck' as const }] : []),
    ...(canManagePlugins ? [{ href: `/orgs/${orgId}/plugins`, label: t('pluginRegistryLink'), icon: 'Puzzle' as const }] : []),
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

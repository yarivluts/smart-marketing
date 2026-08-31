import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
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
 * doc comment. Consolidates navigation into 3 primary modules (Ads & Performance,
 * Funnel & Goals, AI Copilot & Automation) and secondary Settings.
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

  const { memberships } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [tShell] = await Promise.all([
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

  const secondaryItems: AppShellNavItem[] = [
    {
      href: `${base}/settings`,
      label: tShell('settings'),
      icon: 'Settings',
    },
  ];

  const sections: AppShellNavSection[] = [
    {
      items: primaryModuleItems,
    },
    {
      heading: tShell('settingsSection'),
      items: secondaryItems,
    },
  ];

  const mobileTabItems: AppShellNavItem[] = [
    ...primaryModuleItems,
    ...secondaryItems,
  ];

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

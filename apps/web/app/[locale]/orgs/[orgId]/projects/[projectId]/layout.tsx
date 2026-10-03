import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NavShell } from '@/components/shell/nav-shell';
import { buildProjectNavSections, buildMobileTabItems } from '@/config/nav-config';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { parseProjectProfile, getApplicableRequirements } from '@/lib/projects/project-profile';

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * Modern Unified Navigation Shell for GrowthOS projects.
 * Organizes 34+ BI reporting areas and operational modules across 6 functional clusters:
 * Executive & Overview, Marketing & Ad Cockpit, Economics & Cohorts,
 * MRR & Revenue Intelligence, Product & Telemetry, Data & Integrations.
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
    const active = memberships.filter((m) => m.status === 'active');
    if (active.length > 0) {
      redirect(`/${locale}/orgs/${active[0].organizationId}`);
    }
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const t = await getTranslations();

  const organizations = memberships
    .filter((m) => m.status === 'active')
    .map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    }));

  const workspaceProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    env: 'dev',
  }));

  const profile = parseProjectProfile(project);
  const applicableReqs = getApplicableRequirements(profile.businessModel, profile.platformType);
  const verifiedCount = (project.verified_requirements ?? []).filter((id) =>
    applicableReqs.some((r) => r.id === id),
  ).length;

  const navOptions = {
    businessModel: profile.businessModel,
    transactionType: profile.transactionType,
    platformType: profile.platformType,
    primaryStack: profile.primaryStack,
    vertical: project.vertical,
    customHiddenModules: project.custom_hidden_modules,
    verifiedRequirementsCount: verifiedCount,
    totalRequirementsCount: applicableReqs.length,
  };

  const sections = buildProjectNavSections(
    orgId,
    projectId,
    (key) => {
      try {
        return t(key as any);
      } catch {
        return key;
      }
    },
    navOptions,
  );

  const mobileTabItems = buildMobileTabItems(
    orgId,
    projectId,
    (key) => {
      try {
        return t(key as any);
      } catch {
        return key;
      }
    },
    navOptions,
  );

  return (
    <NavShell
      brandName="GrowthOS"
      organizations={organizations}
      currentOrgId={orgId}
      projects={workspaceProjects}
      currentProjectId={projectId}
      currentEnv="dev"
      userEmail={session.email ?? undefined}
      sections={sections}
      mobileTabItems={mobileTabItems}
    >
      {children}
    </NavShell>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { SetupChecklistHub } from '@/components/projects/setup-checklist-hub';
import { parseProjectProfile } from '@/lib/projects/project-profile';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SetupChecklist' });
  return { title: t('metaTitle') };
}

export default async function SetupChecklistPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsetup-checklist`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/setup-checklist`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const profile = parseProjectProfile(project);

  return (
    <main className="w-full space-y-6">
      <SetupChecklistHub
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        initialProfile={profile}
      />
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { PpPage } from '@/components/pastel/primitives';
import { AdStudioNavHeader } from '../components/ad-studio-nav-header';
import { StoryboardEditor } from '../components/storyboard-editor';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdStudioPage' });
  return { title: t('storyboardMetaTitle') };
}

/**
 * GrowthOS AI Ad Studio - Script & Storyboard Editor:
 * Scene breakdown timeline, prompt refinement engine, audio/voiceover editor,
 * and media asset selector.
 */
export default async function StoryboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fad-studio%2Fstoryboard`);
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
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/ad-studio/storyboard`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  return (
    <PpPage className="space-y-8">
      <AdStudioNavHeader orgId={orgId} projectId={projectId} />
      <StoryboardEditor orgId={orgId} projectId={projectId} projectName={project.name} />
    </PpPage>
  );
}

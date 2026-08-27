import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { ProjectSettingsForm } from '@/components/orgs/project-settings-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProjectSettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin corrects a project's own `name`/`vertical` once it's been
 * created — see `updateProjectDetails`'s doc comment for why this closes a
 * gap that's existed since KAN-25. `session_replay_url_template` has its
 * own dedicated page (`.../session-replay`).
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the session-replay and cost-guardrails pages use.
 */
export default async function ProjectSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsettings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const t = await getTranslations('ProjectSettings');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <section>
        <ProjectSettingsForm
          orgId={orgId}
          projectId={projectId}
          initialName={project.name}
          initialVertical={project.vertical ?? ''}
        />
      </section>
    </main>
  );
}

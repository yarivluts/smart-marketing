import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { SessionReplaySettingsForm } from '@/components/orgs/session-replay-settings-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SessionReplaySettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin points this project at its session-replay/heatmap tool, so
 * landing-page rows on a board deep-link into that page's recordings.
 *
 * Deliberately a link-out rather than replay this platform records itself:
 * capturing DOM mutations is a whole separate product (storage, a player,
 * sampling) with real privacy obligations, and the incumbents — Microsoft
 * Clarity free among them — already do it well. The value here is the join
 * this platform uniquely has: from "this page converts worse and costs
 * more" straight to the sessions behind it.
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the cost-guardrails page uses.
 */
export default async function SessionReplaySettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsession-replay`);
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

  const t = await getTranslations('SessionReplaySettings');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <section>
        <SessionReplaySettingsForm
          orgId={orgId}
          projectId={projectId}
          initialTemplate={project.session_replay_url_template ?? ''}
        />
      </section>
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSegmentsForProject } from '@/lib/orgs/queries';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Segments' });
  return { title: t('metaTitle') };
}

/**
 * A project's saved segments (KAN-76, E22.2, plan `13 §22.2`): every segment
 * definition an MCP-connected AI agent has created via `create_segment`,
 * newest-first. Read-only — there is no in-app creation form, since a
 * segment is created through the MCP act-tool surface, not this admin UI;
 * this page exists so a human can still see/audit what an agent saved, the
 * same "view surface for a machine-driven mutation" posture the ingest
 * health page's quarantine browser and the orchestration run history already
 * establish. Gated on `dashboards.write`, reusing the goals/boards features'
 * permission (same reasoning `goals/page.tsx` documents for its own reuse).
 */
export default async function SegmentsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsegments`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const segments = (await listSegmentsForProject(orgId, projectId)).map(toSegmentSummaryView);
  const t = await getTranslations('Segments');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('segmentsHeading')}</h2>
        {segments.length === 0 ? (
          <p className="text-muted-foreground">{t('noSegments')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {segments.map((segment) => (
              <li key={segment.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{segment.name}</span>
                  <span className="text-xs text-muted-foreground">{t('filterCount', { count: segment.filterCount })}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('schemaLabel', { schemaName: segment.schemaName })}</span>
                  <span>{t('createdByLabel', { createdAt: segment.createdAt })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSchemaDefinitionsForProject, listSegmentsForProject } from '@/lib/orgs/queries';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';
import { CreateSegmentForm } from '@/components/orgs/create-segment-form';

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
 * definition created either by a human through this page's own form or by
 * an MCP-connected AI agent via the `create_segment` act tool, newest-first
 * — both paths call the same `createSegment` service function
 * (`segment.service.ts`), so there is exactly one segment definition, not
 * two. Gated on `dashboards.write`, reusing the goals/boards features'
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

  // Only reached once `projectId` is confirmed to belong to this org — same
  // reasoning `goals/page.tsx`'s own comment gives for `listGoalsForProject`.
  const [segments, schemaDefs] = await Promise.all([
    listSegmentsForProject(orgId, projectId).then((rows) => rows.map(toSegmentSummaryView)),
    listSchemaDefinitionsForProject(orgId, projectId),
  ]);
  const entitySchemaNames = activeSchemaNamesForKind(schemaDefs, 'entity');
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        {entitySchemaNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noEntitySchemasRegistered')}</p>
        ) : (
          <CreateSegmentForm orgId={orgId} projectId={projectId} entitySchemaNames={entitySchemaNames} />
        )}
      </section>
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind, buildActiveSchemaDefsByKindAndName } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  countSegmentMembers,
  getProjectCostQuota,
  listActionPluginInstallsForProject,
  listCrmSyncRunsForSegment,
  listOrgPeople,
  listOrgProjects,
  listSchemaDefinitionsForProject,
  listSegmentMembers,
  listSegmentsForProject,
  resolveDefaultQueryEnvironment,
} from '@/lib/orgs/queries';
import { buildSegmentMemberCountView, buildSegmentMemberListView, toSegmentSummaryView, type SegmentMemberCountView, type SegmentMemberListView } from '@/lib/orgs/segment-view';
import { toActionPluginInstallOptionView, toCrmSyncRunView, type CrmSyncRunView } from '@/lib/orgs/crm-sync-view';
import { CreateSegmentForm } from '@/components/orgs/create-segment-form';
import { EditSegmentForm } from '@/components/orgs/edit-segment-form';
import { DeleteSegmentButton } from '@/components/orgs/delete-segment-button';
import { SegmentWorkListControls } from '@/components/orgs/segment-work-list-controls';
import { SegmentCrmSyncControls } from '@/components/orgs/segment-crm-sync-controls';
import { Link } from '@/i18n/navigation';

/** Bounds the "view members" panel's own inline page render — a smaller, page-weight-conscious cap than `listSegmentMembers`'s own `MAX_SEGMENT_MEMBER_LIST_LIMIT`, since this renders inline on a page that already fans out a member-count query per segment. */
const INLINE_MEMBER_LIST_LIMIT = 50;

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ viewMembers?: string }>;
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
 * Each row also carries KAN-81's work-list owner/status controls.
 */
export default async function SegmentsPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { viewMembers: viewMembersParam } = await searchParams;
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
  const [segments, schemaDefs, people, actionInstalls] = await Promise.all([
    listSegmentsForProject(orgId, projectId).then((rows) => rows.map(toSegmentSummaryView)),
    listSchemaDefinitionsForProject(orgId, projectId),
    listOrgPeople(orgId),
    listActionPluginInstallsForProject(orgId, projectId).then((rows) => rows.map(toActionPluginInstallOptionView)),
  ]);
  const entitySchemaNames = activeSchemaNamesForKind(schemaDefs, 'entity');
  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const activeSchemaDefsByKindAndName = buildActiveSchemaDefsByKindAndName(schemaDefs);
  const t = await getTranslations('Segments');

  // Each segment's live member count still runs its own warehouse query, but
  // the project-wide state every one of those queries needs (the default
  // environment, the cost-quota config, the active schema defs) is fetched
  // once here and threaded into every `countSegmentMembers` call below,
  // rather than once per segment — the same `precomputed*` posture
  // `board.service.ts`'s `queryBoardTiles` established for its own per-tile
  // fan-out, closing the "N independent queries" gap this comment used to
  // flag for this spot. `latestCrmSyncRuns` below stays a genuine per-segment
  // fan-out — each is its own segment-scoped list query with no shared state
  // to hoist out.
  const [environment, quota] = await Promise.all([resolveDefaultQueryEnvironment(orgId, projectId), getProjectCostQuota(orgId, projectId)]);
  const memberCountViews = new Map<string, SegmentMemberCountView>(
    await Promise.all(
      segments.map(async (segment): Promise<[string, SegmentMemberCountView]> => [
        segment.id,
        buildSegmentMemberCountView(
          await countSegmentMembers(orgId, projectId, segment.id, {
            environmentId: environment?.id,
            precomputedQuota: quota,
            precomputedActiveSchemaDefsByKindAndName: activeSchemaDefsByKindAndName,
          }),
        ),
      ]),
    ),
  );
  const latestCrmSyncRuns = new Map<string, CrmSyncRunView | null>(
    await Promise.all(
      segments.map(async (segment): Promise<[string, CrmSyncRunView | null]> => [
        segment.id,
        (await listCrmSyncRunsForSegment(orgId, projectId, segment.id, 1)).map(toCrmSyncRunView)[0] ?? null,
      ]),
    ),
  );

  // KAN-107: an on-demand "view members" panel, toggled via `?viewMembers=<segmentId>` (the same
  // query-string-driven pattern `record-feed/page.tsx` uses for its own schema picker) rather than a
  // per-segment detail page — segments, like campaigns, deliberately have no detail page in this
  // codebase (see the KAN-106 omnisearch entry's own note on that convention). Only ever fetched for
  // the one segment actually being viewed, not fanned out across every segment on the page.
  const viewMembersSegmentId = segments.some((segment) => segment.id === viewMembersParam) ? viewMembersParam : undefined;
  const memberListView: SegmentMemberListView | undefined = viewMembersSegmentId
    ? buildSegmentMemberListView(
        await listSegmentMembers(orgId, projectId, viewMembersSegmentId, { environmentId: environment?.id, limit: INLINE_MEMBER_LIST_LIMIT }),
        activeSchemaDefsByKindAndName,
      )
    : undefined;

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('segmentsHeading')}</h2>
        {segments.length === 0 ? (
          <p className="text-muted-foreground">{t('noSegments')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {segments.map((segment) => {
              const memberCountView = memberCountViews.get(segment.id);
              return (
                <li key={segment.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{segment.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('filterCount', { count: segment.filterCount })}</span>
                      {segment.eventConditionCount > 0 ? (
                        <span className="text-xs text-muted-foreground">{t('eventConditionCount', { count: segment.eventConditionCount })}</span>
                      ) : null}
                      <DeleteSegmentButton orgId={orgId} projectId={projectId} segmentId={segment.id} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('schemaLabel', { schemaName: segment.schemaName })}</span>
                    <span>{t('createdByLabel', { createdAt: segment.createdAt })}</span>
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="segment-member-count">
                    {memberCountView?.kind === 'ok'
                      ? t('memberCount', { count: memberCountView.count })
                      : memberCountView?.kind === 'warehouse_not_configured'
                        ? t('memberCountNotConfigured')
                        : memberCountView?.kind === 'quota_exceeded'
                          ? t('memberCountQuotaExceeded')
                          : t('memberCountError')}
                  </div>
                  <EditSegmentForm
                    orgId={orgId}
                    projectId={projectId}
                    segmentId={segment.id}
                    entitySchemaNames={entitySchemaNames}
                    initialName={segment.name}
                    initialSchemaName={segment.schemaName}
                    initialFilters={segment.filters}
                    initialEventConditions={segment.eventConditions}
                  />
                  <SegmentWorkListControls
                    orgId={orgId}
                    projectId={projectId}
                    segmentId={segment.id}
                    ownerPersonId={segment.ownerPersonId}
                    status={segment.status}
                    people={people.map((person) => ({ id: person.id, name: person.name }))}
                  />
                  <SegmentCrmSyncControls
                    orgId={orgId}
                    projectId={projectId}
                    segmentId={segment.id}
                    actionInstalls={actionInstalls}
                    latestRun={latestCrmSyncRuns.get(segment.id) ?? null}
                  />
                  {segment.id === viewMembersSegmentId ? (
                    <Link
                      href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments` }}
                      className="self-start text-xs text-muted-foreground underline"
                    >
                      {t('hideMembers')}
                    </Link>
                  ) : (
                    <Link
                      href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments`, query: { viewMembers: segment.id } }}
                      className="self-start text-xs text-muted-foreground underline"
                    >
                      {t('viewMembers')}
                    </Link>
                  )}
                  {segment.id === viewMembersSegmentId && memberListView ? (
                    <div className="mt-1 flex flex-col gap-2 rounded-md border border-input bg-muted/30 p-2" data-testid="segment-members-panel">
                      {memberListView.kind === 'ok' ? (
                        memberListView.entries.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('membersEmpty')}</p>
                        ) : (
                          <>
                            <ul className="flex flex-col gap-1">
                              {memberListView.entries.map((entry) => (
                                <li key={entry.entityId} className="flex flex-col gap-0.5 rounded border border-input bg-background px-2 py-1 text-xs">
                                  <div className="flex items-center justify-between text-muted-foreground">
                                    <span>{t('memberEntityIdLine', { entityId: entry.entityId })}</span>
                                    <span>{t('memberLastSeenLine', { lastSeenAt: entry.lastSeenAt })}</span>
                                  </div>
                                  {entry.fields.map((field) => (
                                    <span key={field.name} className={field.isPii ? 'text-muted-foreground' : ''}>
                                      {t('memberFieldLine', { name: field.name, value: field.value })}
                                    </span>
                                  ))}
                                </li>
                              ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">{t('membersCapNote', { count: memberListView.entries.length })}</p>
                          </>
                        )
                      ) : memberListView.kind === 'warehouse_not_configured' ? (
                        <p className="text-xs text-muted-foreground">{t('membersNotConfigured')}</p>
                      ) : memberListView.kind === 'quota_exceeded' ? (
                        <p className="text-xs text-muted-foreground">{t('membersQuotaExceeded')}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('membersError')}</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        {entitySchemaNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noEntitySchemasRegistered')}</p>
        ) : (
          <CreateSegmentForm orgId={orgId} projectId={projectId} entitySchemaNames={entitySchemaNames} eventSchemaNames={eventSchemaNames} />
        )}
      </section>
    </main>
  );
}

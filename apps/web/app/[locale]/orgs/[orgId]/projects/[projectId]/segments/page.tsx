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
import { PpPage, PpPageHeader, PpCard, PpEmptyState, PpPill, PpIconChip } from '@/components/pastel/primitives';
import { Users, Plus, Layers, Filter } from 'lucide-react';

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
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/segments`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
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
  // An archived person (KAN-129) drops out of the owner picker's own options — except a segment
  // already assigned to one keeps that option available too, so the picker still renders the
  // segment's real current owner instead of silently falling back to "Unassigned" in the UI.
  const activePeople = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  function ownerPickerOptions(ownerPersonId: string | null) {
    if (!ownerPersonId || activePeople.some((person) => person.id === ownerPersonId)) {
      return activePeople;
    }
    const archivedOwner = people.find((person) => person.id === ownerPersonId);
    return archivedOwner ? [...activePeople, { id: archivedOwner.id, name: archivedOwner.name }] : activePeople;
  }
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
    <PpPage>
      <PpPageHeader
        eyebrow="COHORT ENGINE"
        meta={segments.length > 0 ? `${segments.length} segments` : undefined}
        title={t('title', { projectName: project.name })}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-md text-pp-on-surface">{t('segmentsHeading')}</h2>
          {segments.length > 0 ? (
            <span className="text-pp-label-sm text-pp-outline">
              {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
            </span>
          ) : null}
        </div>

        {segments.length === 0 ? (
          <PpEmptyState
            icon={Users}
            title={t('segmentsHeading')}
            description={t('noSegments')}
          />
        ) : (
          <div className="space-y-pp-md">
            {segments.map((segment) => {
              const memberCountView = memberCountViews.get(segment.id);
              const isViewingMembers = segment.id === viewMembersSegmentId;
              return (
                <div
                  key={segment.id}
                  className="rounded-2xl bg-pp-surface-container-lowest p-pp-lg shadow-pp-candy space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pp-outline-variant/30 pb-3">
                    <div className="flex items-center gap-3">
                      <PpIconChip icon={Users} accent="primary" />
                      <div>
                        <h3 className="font-pp-display text-pp-headline-md text-pp-on-surface">
                          {segment.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-pp-label-sm text-pp-outline">
                          <span>{t('schemaLabel', { schemaName: segment.schemaName })}</span>
                          <span>•</span>
                          <span>{t('createdByLabel', { createdAt: segment.createdAt })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <PpPill accent="mint">{t('filterCount', { count: segment.filterCount })}</PpPill>
                      {segment.eventConditionCount > 0 ? (
                        <PpPill accent="sky">{t('eventConditionCount', { count: segment.eventConditionCount })}</PpPill>
                      ) : null}
                      <DeleteSegmentButton orgId={orgId} projectId={projectId} segmentId={segment.id} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                      className="text-pp-body-md font-semibold text-pp-on-surface"
                      data-testid="segment-member-count"
                    >
                      {memberCountView?.kind === 'ok'
                        ? t('memberCount', { count: memberCountView.count })
                        : memberCountView?.kind === 'warehouse_not_configured'
                          ? t('memberCountNotConfigured')
                          : memberCountView?.kind === 'quota_exceeded'
                            ? t('memberCountQuotaExceeded')
                            : t('memberCountError')}
                    </div>

                    {isViewingMembers ? (
                      <Link
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments` }}
                        className="text-pp-label-md text-pp-primary font-bold hover:underline"
                      >
                        {t('hideMembers')}
                      </Link>
                    ) : (
                      <Link
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments`, query: { viewMembers: segment.id } }}
                        className="text-pp-label-md text-pp-primary font-bold hover:underline"
                      >
                        {t('viewMembers')}
                      </Link>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-pp-md pt-2 border-t border-pp-outline-variant/20">
                    <SegmentWorkListControls
                      orgId={orgId}
                      projectId={projectId}
                      segmentId={segment.id}
                      ownerPersonId={segment.ownerPersonId}
                      status={segment.status}
                      people={ownerPickerOptions(segment.ownerPersonId)}
                    />
                    <SegmentCrmSyncControls
                      orgId={orgId}
                      projectId={projectId}
                      segmentId={segment.id}
                      actionInstalls={actionInstalls}
                      latestRun={latestCrmSyncRuns.get(segment.id) ?? null}
                    />
                  </div>

                  <div className="pt-2 border-t border-pp-outline-variant/20">
                    <EditSegmentForm
                      orgId={orgId}
                      projectId={projectId}
                      segmentId={segment.id}
                      entitySchemaNames={entitySchemaNames}
                      eventSchemaNames={eventSchemaNames}
                      initialName={segment.name}
                      initialSchemaName={segment.schemaName}
                      initialFilters={segment.filters}
                      initialEventConditions={segment.eventConditions}
                    />
                  </div>

                  {isViewingMembers && memberListView ? (
                    <div
                      className="mt-3 rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/60 p-pp-md space-y-3"
                      data-testid="segment-members-panel"
                    >
                      <h4 className="font-pp-display text-pp-headline-sm text-pp-on-surface">
                        {t('viewMembers')} ({segment.name})
                      </h4>
                      {memberListView.kind === 'ok' ? (
                        memberListView.entries.length === 0 ? (
                          <p className="text-pp-body-sm text-pp-on-surface-variant">{t('membersEmpty')}</p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {memberListView.entries.map((entry) => (
                                <div
                                  key={entry.entityId}
                                  className="rounded-xl border border-pp-outline-variant/20 bg-pp-surface-container-lowest p-3 text-pp-body-sm space-y-1 shadow-xs"
                                >
                                  <div className="flex items-center justify-between text-pp-label-sm text-pp-outline">
                                    <span className="font-semibold text-pp-on-surface">
                                      {t('memberEntityIdLine', { entityId: entry.entityId })}
                                    </span>
                                    <span>{t('memberLastSeenLine', { lastSeenAt: entry.lastSeenAt })}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-pp-body-sm">
                                    {entry.fields.map((field) => (
                                      <span key={field.name} className={field.isPii ? 'text-pp-outline italic' : 'text-pp-on-surface'}>
                                        {t('memberFieldLine', { name: field.name, value: field.value })}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-pp-label-sm text-pp-outline">
                              {t('membersCapNote', { count: memberListView.entries.length })}
                            </p>
                          </>
                        )
                      ) : memberListView.kind === 'warehouse_not_configured' ? (
                        <p className="text-pp-body-sm text-pp-on-surface-variant">{t('membersNotConfigured')}</p>
                      ) : memberListView.kind === 'quota_exceeded' ? (
                        <p className="text-pp-body-sm text-pp-on-surface-variant">{t('membersQuotaExceeded')}</p>
                      ) : (
                        <p className="text-pp-body-sm text-pp-on-surface-variant">{t('membersError')}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PpCard
        icon={Plus}
        iconAccent="primary"
        title={t('createHeading')}
      >
        {entitySchemaNames.length === 0 ? (
          <p className="text-pp-body-sm text-pp-on-surface-variant">{t('noEntitySchemasRegistered')}</p>
        ) : (
          <CreateSegmentForm
            orgId={orgId}
            projectId={projectId}
            entitySchemaNames={entitySchemaNames}
            eventSchemaNames={eventSchemaNames}
          />
        )}
      </PpCard>
    </PpPage>
  );
}

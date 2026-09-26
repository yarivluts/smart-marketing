import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, type SegmentFilterCondition } from '@growthos/shared';
import { activeSchemaNamesForKind, buildActiveSchemaDefsByKindAndName } from '@growthos/firebase-orm-models';
import { BarChart3, CalendarDays, Filter, ListTodo, PieChart, Plus, Trophy, UsersRound, Zap } from 'lucide-react';
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
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildSegmentMemberCountView, buildSegmentMemberListView, toSegmentSummaryView, type SegmentMemberCountView, type SegmentMemberListView } from '@/lib/orgs/segment-view';
import { toActionPluginInstallOptionView, toCrmSyncRunView, type CrmSyncRunView } from '@/lib/orgs/crm-sync-view';
import { summarizeSegments } from '@/lib/orgs/growth-viz';
import { cn } from '@/lib/utils';
import { CreateSegmentForm } from '@/components/orgs/create-segment-form';
import { EditSegmentForm } from '@/components/orgs/edit-segment-form';
import { DeleteSegmentButton } from '@/components/orgs/delete-segment-button';
import { SegmentWorkListControls } from '@/components/orgs/segment-work-list-controls';
import { SegmentCrmSyncControls } from '@/components/orgs/segment-crm-sync-controls';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero } from '@/components/viz';
import { Link } from '@/i18n/navigation';

/** Bounds the "view members" panel's own inline page render — a smaller, page-weight-conscious cap than `listSegmentMembers`'s own `MAX_SEGMENT_MEMBER_LIST_LIMIT`, since this renders inline on a page that already fans out a member-count query per segment. */
const INLINE_MEMBER_LIST_LIMIT = 50;

const STATUS_COLOR = {
  open: 'hsl(var(--info))',
  in_progress: 'hsl(var(--warning))',
  done: 'hsl(var(--success))',
} as const;

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
 * Checked at project scope, not just org scope (KAN-136), so a
 * project-scoped `project_admin`/`editor`/`operator` (KAN-135) can reach
 * their own project's segments, not only an org-scope admin.
 * Each segment is a card with its live member count, its filters and event
 * conditions as chips, and KAN-81's work-list owner/status controls; the
 * charts above them compare only the member counts that were measured.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
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
  // KAN-196: the environment picked in the project shell (prod by default) rather than always prod.
  const [{ selected: environment }, quota] = await Promise.all([resolveSelectedEnvironment(orgId, projectId), getProjectCostQuota(orgId, projectId)]);
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

  const numberFormat = new Intl.NumberFormat(locale);
  const stats = summarizeSegments(segments, memberCountViews);
  const measuredSegments = segments.flatMap((segment) => {
    const view = memberCountViews.get(segment.id);
    return view?.kind === 'ok' ? [{ segment, count: view.count }] : [];
  });
  const createdFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const formatCreated = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : createdFormat.format(date);
  };
  const filterChip = (filter: SegmentFilterCondition): string =>
    t('filterChip', { field: filter.field, op: filter.op === 'contains' ? t('filterOpContains') : filter.op, value: String(filter.value) });

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={UsersRound} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiSegments')} value={numberFormat.format(segments.length)} icon={Filter} />
          <StatCard
            title={t('kpiMembers')}
            value={stats.totalMembers !== null ? numberFormat.format(stats.totalMembers) : t('kpiNoValue')}
            icon={UsersRound}
            subtext={stats.totalMembers !== null && stats.measuredCount < segments.length ? t('kpiMembersPartial', { count: stats.measuredCount, total: segments.length }) : undefined}
          />
          <StatCard title={t('kpiLargest')} value={stats.largest ? stats.largest.name : t('kpiNoValue')} subtext={stats.largest ? t('memberCount', { count: stats.largest.count }) : undefined} icon={Trophy} />
          <StatCard
            title={t('kpiOpenWork')}
            value={numberFormat.format(stats.byStatus.open + stats.byStatus.in_progress)}
            subtext={segments.length > 0 ? t('kpiOpenWorkSubtext', { done: stats.byStatus.done }) : undefined}
            icon={ListTodo}
          />
        </div>
      </PageHero>

      {segments.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard title={t('membersChartTitle')} description={t('membersChartDescription')} icon={BarChart3} className="lg:col-span-3" fill>
            {measuredSegments.length > 0 ? (
              <BarList
                items={measuredSegments.map(({ segment, count }) => ({
                  key: segment.id,
                  label: segment.name,
                  sublabel: segment.schemaName,
                  value: count,
                  href: `/orgs/${orgId}/projects/${projectId}/segments?viewMembers=${segment.id}`,
                }))}
                valueFormatter={(value) => numberFormat.format(value)}
                maxItems={8}
                moreLabel={(hidden) => t('membersChartMore', { count: hidden })}
              />
            ) : (
              <EmptyState compact icon={BarChart3} title={t('membersChartEmpty')} />
            )}
          </ChartCard>
          <ChartCard title={t('statusChartTitle')} description={t('statusChartDescription')} icon={PieChart} className="lg:col-span-2" fill>
            <DonutChart
              label={t('statusChartTitle')}
              size={140}
              layout="stacked"
              centerValue={numberFormat.format(segments.length)}
              centerLabel={t('statusChartCenter')}
              data={(['open', 'in_progress', 'done'] as const)
                .filter((status) => stats.byStatus[status] > 0)
                .map((status) => ({ label: t(`statusOption.${status}`), value: stats.byStatus[status], color: STATUS_COLOR[status] }))}
            />
          </ChartCard>
        </div>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="segments-heading">
        <h2 id="segments-heading" className="text-lg font-semibold">
          {t('segmentsHeading')}
        </h2>
        {segments.length === 0 ? (
          <EmptyState icon={UsersRound} title={t('noSegments')} description={t('noSegmentsDetail')} />
        ) : (
          <ul className="flex flex-col gap-4">
            {segments.map((segment) => {
              const memberCountView = memberCountViews.get(segment.id);
              const share = memberCountView?.kind === 'ok' && stats.largest && stats.largest.count > 0 ? (memberCountView.count / stats.largest.count) * 100 : null;
              return (
                <li key={segment.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-foreground">{segment.name}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t('schemaLabel', { schemaName: segment.schemaName })}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t(`statusOption.${segment.status}`)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5" aria-label={t('filtersLabel')}>
                        <span className="text-xs text-muted-foreground">{t('filterCount', { count: segment.filterCount })}</span>
                        {segment.filters.map((filter, index) => (
                          <span key={`f-${index}`} className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border" dir="ltr">
                            <Filter className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            {filterChip(filter)}
                          </span>
                        ))}
                        {segment.eventConditionCount > 0 ? (
                          <span className="ms-1 text-xs text-muted-foreground">{t('eventConditionCount', { count: segment.eventConditionCount })}</span>
                        ) : null}
                        {segment.eventConditions.map((condition, index) => (
                          <span
                            key={`e-${index}`}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ring-1',
                              condition.kind === 'has_event' ? 'bg-success/10 text-success ring-success/20' : 'bg-destructive/10 text-destructive ring-destructive/20',
                            )}
                          >
                            <Zap className="h-3 w-3" aria-hidden="true" />
                            {t(condition.kind === 'has_event' ? 'eventChipHas' : 'eventChipNo', { schemaName: condition.schemaName })}
                            {condition.withinDays ? <span className="opacity-80">{t('eventChipWithin', { days: condition.withinDays })}</span> : null}
                            {condition.filters && condition.filters.length > 0 ? <span className="opacity-80">{t('eventChipFilters', { count: condition.filters.length })}</span> : null}
                          </span>
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                        {t('createdByLabel', { createdAt: formatCreated(segment.createdAt) })}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-start gap-3 sm:flex-col sm:items-end">
                      <div className="min-w-36 rounded-xl bg-muted/40 px-3 py-2 sm:text-end" data-testid="segment-member-count">
                        {memberCountView?.kind === 'ok' ? (
                          <>
                            <div className="text-2xl font-bold tabular-nums text-foreground" dir="ltr">
                              {numberFormat.format(memberCountView.count)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('memberCount', { count: memberCountView.count })}</div>
                            {share !== null ? (
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, share)}%` }} />
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {memberCountView?.kind === 'warehouse_not_configured'
                              ? t('memberCountNotConfigured')
                              : memberCountView?.kind === 'quota_exceeded'
                                ? t('memberCountQuotaExceeded')
                                : t('memberCountError')}
                          </div>
                        )}
                      </div>
                      <DeleteSegmentButton orgId={orgId} projectId={projectId} segmentId={segment.id} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
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
                    {segment.id === viewMembersSegmentId ? (
                      <Link
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments` }}
                        className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t('hideMembers')}
                      </Link>
                    ) : (
                      <Link
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/segments`, query: { viewMembers: segment.id } }}
                        className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t('viewMembers')}
                      </Link>
                    )}
                  </div>
                  {segment.id === viewMembersSegmentId && memberListView ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3" data-testid="segment-members-panel">
                      {memberListView.kind === 'ok' ? (
                        memberListView.entries.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('membersEmpty')}</p>
                        ) : (
                          <>
                            <ul className="grid gap-2 sm:grid-cols-2">
                              {memberListView.entries.map((entry) => (
                                <li key={entry.entityId} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between gap-2 text-muted-foreground">
                                    <span className="truncate font-mono" dir="ltr">
                                      {t('memberEntityIdLine', { entityId: entry.entityId })}
                                    </span>
                                    <span className="shrink-0">{t('memberLastSeenLine', { lastSeenAt: entry.lastSeenAt })}</span>
                                  </div>
                                  {entry.fields.map((field) => (
                                    <span key={field.name} className={cn('truncate', field.isPii ? 'text-muted-foreground' : '')}>
                                      {t('memberFieldLine', { name: field.name, value: field.value })}
                                    </span>
                                  ))}
                                </li>
                              ))}
                            </ul>
                            {/* This panel has something the other capped lists do
                                not: an authoritative total, already fetched for the
                                segment's own member count. So it states "N of M"
                                rather than flagging truncation - knowing you are
                                seeing 50 of 4,312 is strictly more useful than
                                knowing there are more. Falls back to the bare count
                                only when the count query itself degraded, since
                                then no total exists to compare against. */}
                            <p className="text-xs text-muted-foreground">
                              {memberCountView?.kind === 'ok'
                                ? t('membersCapNoteOfTotal', { count: memberListView.entries.length, total: memberCountView.count })
                                : t('membersCapNote', { count: memberListView.entries.length })}
                            </p>
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

      <ChartCard title={t('createHeading')} description={t('createDescription')} icon={Plus}>
        {entitySchemaNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noEntitySchemasRegistered')}</p>
        ) : (
          <CreateSegmentForm orgId={orgId} projectId={projectId} entitySchemaNames={entitySchemaNames} eventSchemaNames={eventSchemaNames} />
        )}
      </ChartCard>
    </main>
  );
}

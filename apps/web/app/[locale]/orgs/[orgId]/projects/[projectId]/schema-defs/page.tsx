import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  evaluateProjectSetupHealth,
  getEventVolumeOverviewForProject,
  listOrgProjects,
  listQuarantinedRecordsForProject,
  listSchemaDefinitionsForProject,
  listTrackingAlertsForProject,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { Link } from '@/i18n/navigation';
import { toSchemaDefView, type SchemaDefView } from '@/lib/orgs/schema-def-view';
import { toTrackingAlertView, trackingAlertStatusLabelKey } from '@/lib/orgs/tracking-alert-view';
import { buildRequirementLanes, countFamiliesByKind, dailyVolumeTotals, stackedVolumeChart, totalEvents, type SchemaChipStatus } from '@/lib/orgs/schema-registry-viz';
import { formatRelativeTime } from '@/lib/orgs/recency';
import { RegisterSchemaDefForm } from '@/components/orgs/register-schema-def-form';
import { SchemaFamilyCard, type SchemaVersionView } from '@/components/orgs/schema-family-card';
import { CheckTrackingAlertsButton } from '@/components/orgs/check-tracking-alerts-button';
import { SyncSchemaMartsButton } from '@/components/orgs/sync-schema-marts-button';
import { EventVolumeSparkline } from '@/components/orgs/event-volume-sparkline';
import { RegisterTouchpointSchemaButton } from '@/components/orgs/register-touchpoint-schema-button';
import { SchemaKindIcon } from '@/components/orgs/schema-kind-icon';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Database,
  FilePlus2,
  Layers,
  ListChecks,
  MousePointerClick,
  Radio,
  Rows3,
  VolumeX,
} from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SchemaRegistry' });
  return { title: t('metaTitle') };
}

interface SchemaFamily {
  kind: string;
  name: string;
  versions: SchemaVersionView[];
}

// Client components only ever receive plain serializable data (never an
// `@arbel/firebase-orm` model instance) — reuses the same field mapping the
// API routes use (`toSchemaDefView`) rather than a second, independently
// maintained copy of it.
function groupIntoFamilies(views: readonly SchemaDefView[]): SchemaFamily[] {
  const familiesByKey = new Map<string, SchemaFamily>();
  for (const view of views) {
    const key = `${view.kind}:${view.name}`;
    const family = familiesByKey.get(key) ?? { kind: view.kind, name: view.name, versions: [] };
    family.versions.push({ id: view.id, version: view.version, status: view.status, fields: view.fields });
    familiesByKey.set(key, family);
  }
  return [...familiesByKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

const CHIP_STYLE: Record<SchemaChipStatus, { className: string; icon: typeof CheckCircle2 }> = {
  flowing: { className: 'border-success/30 bg-success/10 text-foreground', icon: CheckCircle2 },
  rejected: { className: 'border-destructive/40 bg-destructive/10 text-destructive', icon: AlertTriangle },
  silent: { className: 'border-dashed border-border bg-muted/40 text-muted-foreground', icon: CircleDashed },
};

const LANE_STATUS_DOT: Record<'connected' | 'error' | 'gap' | 'unknown', string> = {
  connected: 'bg-success',
  error: 'bg-destructive',
  gap: 'bg-muted-foreground/40',
  unknown: 'bg-muted-foreground/40',
};

/**
 * A project's Schema Registry (KAN-31): every registered entity/event/measure
 * schema, every version of each ("register v1 -> evolve to v2 -> both
 * queryable"), and a form to register a new one or evolve an existing family
 * to its next version. Gated on `schema.write` for the whole page — same
 * "whole feature, not just mutation, is admin-only" posture as KAN-30's keys
 * page, since a schema's field list (including which fields carry PII) is
 * sensitive enough to keep to roles trusted to manage it.
 *
 * Above the registry: the picked environment's event volume (stacked per schema and per-schema
 * sparklines, from the same 7-day overview the tracking alerts use), the registry's kind mix, and
 * which schema feeds which setup requirement (KAN-197's own name-based classification, coloured by
 * what that environment actually received).
 */
export default async function SchemaRegistryPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fschema-defs`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId, projectId })) {
    notFound();
  }

  // KAN-196: tracking alerts, event volume, setup health and the rejected-record tally are scoped to
  // the environment picked in the project shell (prod by default). Schema definitions themselves are
  // project-wide, shared by every environment, so they stay unscoped.
  const { selected: selectedEnvironment, environments } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentId = selectedEnvironment?.id;
  const [projects, schemaDefs, trackingAlerts, setupHealth] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    listTrackingAlertsForProject(orgId, projectId, { environmentId }),
    environmentId !== undefined ? evaluateProjectSetupHealth(orgId, projectId, environmentId) : Promise.resolve(null),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // Reuses the schema-defs list just fetched above rather than a second, redundant
  // Firestore read of the same collection (same `precomputedQuota`-style pass-through
  // pattern the cost-guardrails page uses for its own equivalent duplicate fetch).
  const eventVolumeOverview = await getEventVolumeOverviewForProject(orgId, projectId, { precomputedSchemaDefs: schemaDefs, environmentId });

  /*
    Rejected records, tallied per schema and environment.

    The volume overview is built from LANDED records, and a quarantined record never lands -
    it is diverted before raw_records is written. So a schema whose traffic is being rejected
    in full reports lastSeenAt: null and renders as "Never received a record", which reads as
    "you have not sent anything". The opposite can be true: hundreds of records arriving and
    every one bouncing off one undeclared property.

    That is the single worst state to be in silently, because the page that exists to tell you
    whether tracking works says the thing that makes you go and check your emitter.

    Bounded by a sample rather than a count query: Firestore has no group-by, a per-schema
    count would be one query per schema per environment, and the exact number matters far less
    than the fact that it is not zero. The copy says it is a sample so the figure is not read
    as authoritative.
  */
  const QUARANTINE_SAMPLE_SIZE = 500;
  const quarantinedSample = await listQuarantinedRecordsForProject(orgId, projectId, QUARANTINE_SAMPLE_SIZE, environmentId);
  const rejectedCountByKey = new Map<string, number>();
  for (const record of quarantinedSample) {
    const key = `${record.schema_name}:${record.environment_id}`;
    rejectedCountByKey.set(key, (rejectedCountByKey.get(key) ?? 0) + 1);
  }

  const families = groupIntoFamilies(schemaDefs.map(toSchemaDefView));
  // `TrackingAlertModel` only stores `environment_id` — resolve the display name server-side,
  // same "build an id->name lookup, pass plain strings across the RSC boundary" pattern the
  // keys page's own `environmentNameById` map already uses.
  const environmentNameById = new Map(environments.map((environment) => [environment.id, environment.name]));
  const trackingAlertViews = trackingAlerts.map((alert) => toTrackingAlertView(alert, environmentNameById.get(alert.environment_id) ?? alert.environment_id));
  const touchpointSchemaRegistered = schemaDefs.some((schemaDef) => schemaDef.kind === 'event' && schemaDef.name === 'touchpoint');

  const t = await getTranslations('SchemaRegistry');
  const tEnv = await getTranslations('EnvBadge');
  const tSetup = await getTranslations('SetupHealth');
  const numberFormat = new Intl.NumberFormat(locale);
  const now = Date.now();
  const shortDate = (date: string): string => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
  };

  // Everything below is derived from the three reads above - no sample or placeholder numbers.
  const kindCounts = countFamiliesByKind(families);
  const versionCount = families.reduce((sum, family) => sum + family.versions.length, 0);
  const dailyTotals = dailyVolumeTotals(eventVolumeOverview);
  const weekTotal = dailyTotals.reduce((sum, bucket) => sum + bucket.count, 0);
  const liveSchemaCount = eventVolumeOverview.filter((entry) => totalEvents(entry) > 0).length;
  const silentEntries = eventVolumeOverview.filter((entry) => entry.lastSeenAt === null);
  const volumeChart = stackedVolumeChart(eventVolumeOverview, 5, t('volumeOtherSeries'), shortDate);
  const healthForEnvironment = setupHealth?.environments.find((environment) => environment.environmentId === environmentId) ?? null;
  const { lanes, unmapped } = buildRequirementLanes(families, healthForEnvironment);
  const selectedEnvironmentLabel = tEnv(selectedEnvironment?.name ?? 'prod');
  const volumeRows = [...eventVolumeOverview].sort((a, b) => totalEvents(b) - totalEvents(a) || a.schemaName.localeCompare(b.schemaName));

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={Database}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('heroDescription')}
        actions={
          <Link
            href={`/orgs/${orgId}/projects/${projectId}/record-feed`}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <Rows3 className="h-4 w-4" aria-hidden="true" />
            {t('heroRecordFeedLink')}
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiSchemas')} value={numberFormat.format(families.length)} subtext={t('kpiSchemasSub', { versions: versionCount })} icon={Layers} />
          <StatCard
            title={t('kpiWeekEvents')}
            value={numberFormat.format(weekTotal)}
            subtext={t('kpiWeekEventsSub', { environment: selectedEnvironmentLabel })}
            trendData={dailyTotals.map((bucket) => bucket.count)}
            icon={Activity}
          />
          <StatCard
            title={t('kpiLiveSchemas')}
            value={`${numberFormat.format(liveSchemaCount)}/${numberFormat.format(eventVolumeOverview.length)}`}
            progress={eventVolumeOverview.length > 0 ? Math.round((liveSchemaCount / eventVolumeOverview.length) * 100) : undefined}
            icon={Radio}
          />
          <StatCard
            title={t('kpiSilentSchemas')}
            value={numberFormat.format(silentEntries.length)}
            subtext={trackingAlertViews.some((alert) => alert.status === 'active') ? t('kpiActiveAlerts', { count: trackingAlertViews.filter((alert) => alert.status === 'active').length }) : undefined}
            icon={VolumeX}
          />
        </div>
      </PageHero>

      <section
        className={cn(
          'flex flex-col gap-3 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between',
          touchpointSchemaRegistered ? 'border-border bg-card' : 'border-primary/30 bg-primary/5',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {touchpointSchemaRegistered ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <MousePointerClick className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t('touchpointCaptureHeading')}</h2>
            <p className="text-sm text-muted-foreground">{touchpointSchemaRegistered ? t('touchpointSchemaAlreadyRegistered') : t('touchpointSchemaIntro')}</p>
          </div>
        </div>
        {!touchpointSchemaRegistered ? <RegisterTouchpointSchemaButton orgId={orgId} projectId={projectId} /> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title={t('volumeChartTitle')} description={t('volumeChartDescription', { environment: selectedEnvironmentLabel })} icon={Activity} className="lg:col-span-2" fill>
          {weekTotal > 0 ? (
            <TrendChart label={t('volumeChartTitle')} xKey="date" data={volumeChart.rows} series={volumeChart.series} kind="bar" stacked height={260} />
          ) : (
            <EmptyState compact icon={Activity} title={t('volumeChartEmpty')} description={t('volumeChartEmptyDetail')} />
          )}
        </ChartCard>
        <ChartCard title={t('typesTitle')} description={t('typesDescription')} icon={Boxes} fill>
          {families.length > 0 ? (
            <DonutChart
              label={t('typesTitle')}
              centerValue={numberFormat.format(families.length)}
              centerLabel={t('typesCenter')}
              data={[
                { label: t('typeEvent'), value: kindCounts.event, color: 'hsl(var(--primary))' },
                { label: t('typeEntity'), value: kindCounts.entity, color: 'hsl(var(--info))' },
                { label: t('typeMeasure'), value: kindCounts.measure, color: 'hsl(var(--success))' },
              ]}
              size={150}
              layout="stacked"
            />
          ) : (
            <EmptyState compact icon={Boxes} title={t('typesEmpty')} />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title={t('coverageTitle')}
        description={t('coverageDescription', { environment: selectedEnvironmentLabel })}
        icon={ListChecks}
        actions={
          <Link href={`/orgs/${orgId}/projects/${projectId}/ingest-health`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            {t('coverageIngestHealthLink')}
          </Link>
        }
        footer={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {t('chipLegendFlowing')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              {t('chipLegendRejected')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
              {t('chipLegendSilent')}
            </span>
            {unmapped.length > 0 ? <span>{t('coverageUnmapped', { schemas: unmapped.map((family) => family.name).join(', ') })}</span> : null}
          </span>
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="schema-requirement-lanes">
          {lanes.map((lane) => (
            <li key={lane.requirementId} className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3" data-testid={`schema-lane-${lane.requirementId}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{tSetup(`requirements.${lane.requirementId}.title`)}</span>
                <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', LANE_STATUS_DOT[lane.status ?? 'unknown'])} aria-hidden="true" />
              </div>
              <span className="text-xs text-muted-foreground">{lane.status ? tSetup(`status.${lane.status}`) : t('coverageStatusUnknown')}</span>
              {lane.schemas.length === 0 ? (
                <span className="rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">{t('coverageNoSchema')}</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {lane.schemas.map((schema) => {
                    const style = CHIP_STYLE[schema.status];
                    const Icon = style.icon;
                    return (
                      <span
                        key={`${schema.kind}:${schema.name}`}
                        className={cn('inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]', style.className)}
                        title={schema.registered ? undefined : t('chipNotRegistered')}
                        data-status={schema.status}
                        dir="ltr"
                      >
                        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{schema.name}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard
        title={t('eventVolumeHeading')}
        description={t('eventVolumeDescription')}
        icon={BellRing}
        actions={<CheckTrackingAlertsButton orgId={orgId} projectId={projectId} />}
      >
        <div className="flex flex-col gap-4">
          {quarantinedSample.length >= QUARANTINE_SAMPLE_SIZE ? (
            <p className="text-xs text-muted-foreground">{t('eventRejectedSampleNote', { sampled: QUARANTINE_SAMPLE_SIZE })}</p>
          ) : null}
          {eventVolumeOverview.length === 0 ? (
            <EmptyState compact icon={Activity} title={t('noEventSchemas')} />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {volumeRows.map((entry) => {
                const rejectedCount = rejectedCountByKey.get(`${entry.schemaName}:${entry.environmentId}`) ?? 0;
                const total = totalEvents(entry);
                return (
                  <li
                    key={`${entry.schemaName}:${entry.environmentId}`}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm',
                      rejectedCount > 0 ? 'border-warning/50 bg-warning/5' : entry.lastSeenAt === null ? 'border-dashed border-border' : 'border-border',
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium">
                        {t('eventVolumeSchemaEnvironmentLabel', { schemaName: entry.schemaName, environmentName: tEnv(entry.environmentName) })}
                      </span>
                      <span className="text-xs text-muted-foreground" title={entry.lastSeenAt ?? undefined}>
                        {entry.lastSeenAt === null ? t('eventNeverSeen') : t('eventLastSeenRelative', { relative: formatRelativeTime(entry.lastSeenAt, now, locale) })}
                      </span>
                      {rejectedCount > 0 ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {t('eventRejectedCount', { count: rejectedCount })}{' '}
                          <Link className="underline" href={`/orgs/${orgId}/projects/${projectId}/ingest-health`}>
                            {t('eventRejectedLink')}
                          </Link>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-end gap-3">
                      <span className="text-end">
                        <span className="block text-base font-semibold tabular-nums text-foreground" dir="ltr">
                          {numberFormat.format(total)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('eventVolumeWeekUnit')}</span>
                      </span>
                      <EventVolumeSparkline dailyCounts={entry.dailyCounts} className="h-9 w-20" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t('trackingAlertsHeading')}</h3>
            {trackingAlertViews.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noTrackingAlerts')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {trackingAlertViews.map((alert) => (
                  <li
                    key={alert.id}
                    className={cn('flex items-start gap-3 rounded-xl border px-3 py-2 text-sm', alert.status === 'active' ? 'border-warning/50 bg-warning/5' : 'border-border')}
                  >
                    {alert.status === 'active' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        {t('trackingAlertSummary', {
                          schemaName: alert.schemaName,
                          environmentName: tEnv(alert.environmentName),
                          status: t(trackingAlertStatusLabelKey(alert.status)),
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground">{t('trackingAlertLastSeen', { lastSeenAt: alert.lastSeenAt })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ChartCard>

      <ChartCard title={t('registeredHeading')} description={t('registeredDescription')} icon={Layers} actions={<SyncSchemaMartsButton orgId={orgId} projectId={projectId} />}>
        {families.length === 0 ? (
          <EmptyState compact icon={Layers} title={t('noSchemas')} description={t('noSchemasDetail')} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {families.map((family) => (
              <SchemaFamilyCard
                key={`${family.kind}:${family.name}`}
                orgId={orgId}
                projectId={projectId}
                kind={family.kind}
                name={family.name}
                versions={family.versions}
              />
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard title={t('registerHeading')} description={t('registerDescription')} icon={FilePlus2}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {(['event', 'entity', 'measure'] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1">
              <SchemaKindIcon kind={kind} size="sm" />
              {t(`typeHint.${kind}`)}
            </span>
          ))}
        </div>
        <RegisterSchemaDefForm orgId={orgId} projectId={projectId} />
      </ChartCard>
    </div>
  );
}

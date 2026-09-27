import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { DEFAULT_RECORD_FEED_LIMIT, RECORD_FIELD_FILTER_CANDIDATE_WINDOW } from '@growthos/firebase-orm-models';
import { splitOverFetchedFeed } from '@/lib/orgs/capped-list-view';
import { listOrgProjects, listRecentRecordsForSchema, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { recordFeedFilterOptions, toRecordFeedEntryView } from '@/lib/orgs/record-feed-view';
import { arrivalBuckets, identityCoverage, mostCommonFieldValues } from '@/lib/orgs/record-feed-viz';
import { formatRelativeTime } from '@/lib/orgs/recency';
import { RecordFeedEntryList, RecordFeedFieldSelect } from '@/components/orgs/record-feed-entry-list';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, EmptyState, PageHero, TrendChart } from '@/components/viz';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, Clock, Database, Fingerprint, ListFilter, Rows3, SearchX, UserCheck, Zap } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ schema?: string; field?: string; value?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'RecordFeed' });
  return { title: t('metaTitle') };
}

/**
 * A project's generic record feed (KAN-81, E14.x, `docs/plan/14-gap-analysis.md` Gap 5: "recent
 * payments / churns / failed charges ... as browsable, filterable record streams") — the
 * schema-agnostic generalization of KAN-80's billing-ops feed: instead of a fixed Stripe schema set,
 * a human picks any registered `event` schema in the project and browses its most recently landed
 * records, rendered from the schema's own declared fields (`SchemaDefModel.field_defs`) rather than a
 * per-schema view mapper. A field flagged `is_pii` is never sent to this page's client render at all —
 * `record-feed-view.ts`'s `toRecordFeedEntryView` substitutes a fixed redaction placeholder before the
 * projection leaves the server. The same PII gate applies to filtering: the field picker below only
 * ever offers non-PII fields, so a PII value can never round-trip through this page's own `?field=`/
 * `?value=` query string. Each event also shows its `anon_id`/`customer_id` identity keys (KAN-210),
 * which are accepted undeclared in `properties` and are what identity stitching joins on; both are
 * filterable too, unless the schema explicitly declares one `is_pii`. Gated on `ingest.write`, same
 * "whole feature, not just mutation, is admin-only" posture as the billing-ops feed and ingest-health pages, since this exposes raw landed
 * payloads.
 *
 * The summary above the timeline (identity coverage, arrival rhythm, most common field values) is
 * computed from exactly the records the timeline shows - it never implies more than was fetched.
 */
export default async function RecordFeedPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { schema: schemaParam, field: fieldParam, value: valueParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Frecord-feed`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, schemaDefs, { selected: selectedEnvironment, environments }] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    resolveSelectedEnvironment(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const selectedSchemaName = schemaParam && eventSchemaNames.includes(schemaParam) ? schemaParam : eventSchemaNames[0];
  const selectedSchemaDef = schemaDefs.find((def) => def.kind === 'event' && def.status === 'active' && def.name === selectedSchemaName);

  // Declared non-PII fields plus the event identity keys (KAN-210) - see `recordFeedFilterOptions`.
  const filterOptions = recordFeedFilterOptions('event', selectedSchemaDef?.field_defs ?? []);
  const filterableFieldNames = [...filterOptions.declared, ...filterOptions.identity];
  const filterFieldName = fieldParam && filterableFieldNames.includes(fieldParam) ? fieldParam : undefined;
  const filterValue = filterFieldName && valueParam ? valueParam : undefined;
  const fieldFilter = filterFieldName && filterValue ? { fieldName: filterFieldName, value: filterValue } : undefined;

  // Over-fetched by one so the cap note can say whether more exist. Note this is
  // a different question from the FILTER WINDOW below: this measures "are there
  // more records than we show", the window is "how far back did we look at all".
  const records = selectedSchemaName
    ? await listRecentRecordsForSchema(orgId, projectId, 'event', selectedSchemaName, fieldFilter, DEFAULT_RECORD_FEED_LIMIT + 1, selectedEnvironment?.id)
    : [];
  const recordPage = splitOverFetchedFeed(records, DEFAULT_RECORD_FEED_LIMIT);
  const entries = recordPage.rows.map((record) => toRecordFeedEntryView(record, selectedSchemaDef?.field_defs ?? []));

  const t = await getTranslations('RecordFeed');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));
  const numberFormat = new Intl.NumberFormat(locale);
  const now = Date.now();

  const coverage = identityCoverage(entries);
  const arrivals = arrivalBuckets(entries);
  const bucketLabel = new Intl.DateTimeFormat(
    locale,
    arrivals.granularity === 'hour' ? { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' },
  );
  const arrivalRows = arrivals.buckets.map((bucket) => ({ bucket: bucketLabel.format(new Date(bucket.start)), records: bucket.count }));
  const topValues = mostCommonFieldValues(entries);
  const newest = entries[0]?.landedAt;
  const identifiedPercent = coverage.total > 0 ? Math.round((coverage.identified / coverage.total) * 100) : null;
  const feedPath = `/orgs/${orgId}/projects/${projectId}/record-feed`;

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Rows3} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        {eventSchemaNames.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title={t('kpiRecords')}
              value={numberFormat.format(entries.length)}
              subtext={recordPage.truncated ? t('kpiRecordsMore') : undefined}
              icon={Database}
            />
            <StatCard
              title={t('kpiIdentified')}
              value={identifiedPercent !== null ? `${identifiedPercent}%` : t('kpiNoValue')}
              progress={identifiedPercent ?? undefined}
              icon={UserCheck}
            />
            <StatCard
              title={t('kpiVisitors')}
              value={numberFormat.format(coverage.distinctAnonIds)}
              subtext={t('kpiCustomersSub', { count: coverage.distinctCustomerIds })}
              icon={Fingerprint}
            />
            <StatCard title={t('kpiLatest')} value={newest ? formatRelativeTime(newest, now, locale) : t('kpiNoValue')} icon={Clock} />
          </div>
        ) : null}
      </PageHero>

      {eventSchemaNames.length === 0 ? (
        <EmptyState icon={Zap} title={t('noEventSchemasRegistered')} description={t('noEventSchemasDetail')} />
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <nav aria-label={t('schemaPickerLabel')} className="flex flex-wrap gap-2">
              {eventSchemaNames.map((schemaName) => {
                const isActive = schemaName === selectedSchemaName;
                return (
                  <Link
                    key={schemaName}
                    href={{ pathname: feedPath, query: { schema: schemaName } }}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                      isActive ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background hover:bg-muted',
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    {schemaName}
                  </Link>
                );
              })}
            </nav>

            {filterableFieldNames.length > 0 ? (
              <form method="get" className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
                <input type="hidden" name="schema" value={selectedSchemaName} />
                <ListFilter className="mb-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <label htmlFor="record-feed-filter-field" className="text-xs font-medium text-muted-foreground">
                    {t('filterFieldLabel')}
                  </label>
                  <RecordFeedFieldSelect
                    id="record-feed-filter-field"
                    declaredFieldNames={filterOptions.declared}
                    identityFieldNames={filterOptions.identity}
                    defaultValue={filterFieldName ?? ''}
                  />
                </div>
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <label htmlFor="record-feed-filter-value" className="text-xs font-medium text-muted-foreground">
                    {t('filterValueLabel')}
                  </label>
                  <input
                    id="record-feed-filter-value"
                    name="value"
                    defaultValue={filterValue ?? ''}
                    placeholder={t('filterValuePlaceholder')}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                  {t('filterApply')}
                </button>
                {fieldFilter ? (
                  <Link href={{ pathname: feedPath, query: { schema: selectedSchemaName } }} className="h-10 px-2 text-sm leading-10 text-muted-foreground underline-offset-4 hover:underline">
                    {t('filterClear')}
                  </Link>
                ) : null}
              </form>
            ) : null}
          </section>

          {entries.length > 1 ? (
            <div className="grid gap-6 lg:grid-cols-5">
              <ChartCard
                title={t('arrivalsTitle')}
                description={arrivals.granularity === 'hour' ? t('arrivalsHourly', { count: entries.length }) : t('arrivalsDaily', { count: entries.length })}
                icon={BarChart3}
                className="lg:col-span-3"
                fill
              >
                <TrendChart label={t('arrivalsTitle')} xKey="bucket" data={arrivalRows} series={[{ key: 'records', label: t('arrivalsSeries') }]} kind="bar" height={220} />
              </ChartCard>
              <ChartCard
                title={topValues ? t('topValuesTitle', { field: topValues.field }) : t('topValuesTitleEmpty')}
                description={t('topValuesDescription', { count: entries.length })}
                icon={ListFilter}
                className="lg:col-span-2"
                fill
              >
                {topValues ? (
                  <BarList
                    items={topValues.values.map((entry) => ({
                      key: entry.value,
                      label: entry.value,
                      value: entry.count,
                      href: `${feedPath}?schema=${encodeURIComponent(selectedSchemaName ?? '')}&field=${encodeURIComponent(topValues.field)}&value=${encodeURIComponent(entry.value)}`,
                    }))}
                  />
                ) : (
                  <EmptyState compact icon={ListFilter} title={t('topValuesEmpty')} />
                )}
              </ChartCard>
            </div>
          ) : null}

          <ChartCard title={t('timelineTitle', { schema: selectedSchemaName ?? '' })} icon={Zap} footer={recordPage.truncated ? t('capNoteTruncated', { count: entries.length }) : t('capNote', { count: entries.length })}>
            <div className="flex flex-col gap-3">
              {/* The window is stated because the filter does not search the schema, it
                   searches the most recent slice of it - a matching record older than
                   the window is never examined. Saying "filtered to X" without that
                   makes an empty result read as "no such record". */}
              {fieldFilter ? (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  {t('filterActiveNote', { field: fieldFilter.fieldName, value: fieldFilter.value, window: RECORD_FIELD_FILTER_CANDIDATE_WINDOW })}
                </p>
              ) : null}
              {entries.length === 0 ? (
                <EmptyState
                  compact
                  icon={fieldFilter ? SearchX : Zap}
                  title={fieldFilter ? t('filterEmptyTitle') : t('empty')}
                  description={fieldFilter ? t('filterEmpty', { window: RECORD_FIELD_FILTER_CANDIDATE_WINDOW }) : undefined}
                />
              ) : (
                <RecordFeedEntryList entries={entries} environmentDisplayNameById={environmentDisplayNameById} nowMs={now} />
              )}
            </div>
          </ChartCard>
        </>
      )}
    </main>
  );
}

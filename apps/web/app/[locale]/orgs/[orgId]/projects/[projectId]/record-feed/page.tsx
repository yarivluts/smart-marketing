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
import { RecordFeedEntryList, RecordFeedFieldSelect } from '@/components/orgs/record-feed-entry-list';
import { Link } from '@/i18n/navigation';

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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {eventSchemaNames.length === 0 ? (
        <p className="text-muted-foreground">{t('noEventSchemasRegistered')}</p>
      ) : (
        <>
          <nav aria-label={t('schemaPickerLabel')} className="flex flex-wrap gap-2">
            {eventSchemaNames.map((schemaName) => {
              const isActive = schemaName === selectedSchemaName;
              return (
                <Link
                  key={schemaName}
                  href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: schemaName } }}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground'
                      : 'rounded-full border border-input px-3 py-1 text-sm hover:bg-accent'
                  }
                >
                  {schemaName}
                </Link>
              );
            })}
          </nav>

          {filterableFieldNames.length > 0 ? (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="schema" value={selectedSchemaName} />
              <div className="flex flex-col gap-1">
                <label htmlFor="record-feed-filter-field" className="text-xs text-muted-foreground">
                  {t('filterFieldLabel')}
                </label>
                <RecordFeedFieldSelect
                  id="record-feed-filter-field"
                  declaredFieldNames={filterOptions.declared}
                  identityFieldNames={filterOptions.identity}
                  defaultValue={filterFieldName ?? ''}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="record-feed-filter-value" className="text-xs text-muted-foreground">
                  {t('filterValueLabel')}
                </label>
                <input
                  id="record-feed-filter-value"
                  name="value"
                  defaultValue={filterValue ?? ''}
                  placeholder={t('filterValuePlaceholder')}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
              <button type="submit" className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent">
                {t('filterApply')}
              </button>
              {fieldFilter ? (
                <Link
                  href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: selectedSchemaName } }}
                  className="text-xs text-muted-foreground underline"
                >
                  {t('filterClear')}
                </Link>
              ) : null}
            </form>
          ) : null}

          <section className="flex flex-col gap-3">
            {/* The window is stated because the filter does not search the schema, it
                 searches the most recent slice of it - a matching record older than
                 the window is never examined. Saying "filtered to X" without that
                 makes an empty result read as "no such record". */}
            {fieldFilter ? (
              <p className="text-xs text-muted-foreground">
                {t('filterActiveNote', { field: fieldFilter.fieldName, value: fieldFilter.value, window: RECORD_FIELD_FILTER_CANDIDATE_WINDOW })}
              </p>
            ) : null}
            {entries.length === 0 ? (
              <p className="text-muted-foreground">
                {fieldFilter ? t('filterEmpty', { window: RECORD_FIELD_FILTER_CANDIDATE_WINDOW }) : t('empty')}
              </p>
            ) : (
              <RecordFeedEntryList entries={entries} environmentDisplayNameById={environmentDisplayNameById} />
            )}
            <p className="text-xs text-muted-foreground">
              {recordPage.truncated ? t('capNoteTruncated', { count: entries.length }) : t('capNote', { count: entries.length })}
            </p>
          </section>
        </>
      )}
    </main>
  );
}

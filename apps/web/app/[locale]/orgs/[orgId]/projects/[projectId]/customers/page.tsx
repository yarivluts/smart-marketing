import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind, buildActiveSchemaDefsByKindAndName, schemaDefMapKey } from '@growthos/firebase-orm-models';
import { Boxes, Clock, DatabaseZap, Fingerprint, KeyRound, Lock, PieChart, Search, SearchX, UserRound, Users } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSchemaDefinitionsForProject, searchProjectCustomers } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildCustomerSearchView } from '@/lib/orgs/customer-search-view';
import { customerDisplayName, customerSchemaBreakdown, entityInitials, summarizeEntitySchemas } from '@/lib/orgs/growth-viz';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ q?: string; schema?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Customers' });
  return { title: t('metaTitle') };
}

/**
 * A project's Customer 360 search (KAN-108): substring search over every landed `entities` row,
 * across every registered entity schema unless narrowed to one — the exact same warehouse-backed
 * `searchProjectCustomers` (`mcp-tools.service.ts`, KAN-75) the MCP server's own `search_customers`
 * tool already exposes to an AI agent, but until now with no human-facing home at all: an operator
 * could ask an MCP-connected agent to look a customer up, but had no way to do the same lookup
 * themselves in the web app — the exact "no first-class individual-customer index yet" gap
 * `omnisearch/types.ts`'s own doc comment names. Wraps the search through `searchProjectCustomersForAdmin`
 * so the three expected-not-buggy warehouse failure modes (unconfigured, quota exhausted, query
 * rejected) degrade the results panel the same honest way the Segments page's own "view members"
 * panel degrades, rather than crashing. A field flagged `is_pii` is never sent to this page's client
 * render at all, same posture as the record feed and segment member list. Before a search, the page
 * shows what each registered entity schema declares; after one, how the matches split across them.
 * Gated on `ingest.write`, the same "whole feature, not just mutation, is admin-only" posture the
 * record feed and billing-ops feed pages already establish for browsing raw landed data.
 */
export default async function CustomersPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { q: queryParam, schema: schemaParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcustomers`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, schemaDefs] = await Promise.all([listOrgProjects(orgId), listSchemaDefinitionsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };

  const entitySchemaNames = activeSchemaNamesForKind(schemaDefs, 'entity');
  const activeSchemaDefsByKindAndName = buildActiveSchemaDefsByKindAndName(schemaDefs);
  const selectedSchemaName = schemaParam && entitySchemaNames.includes(schemaParam) ? schemaParam : undefined;
  const trimmedQuery = queryParam?.trim();

  const view =
    trimmedQuery && trimmedQuery.length > 0
      ? buildCustomerSearchView(
          await searchProjectCustomers(orgId, projectId, trimmedQuery, { schemaName: selectedSchemaName, ...environmentScope }),
          activeSchemaDefsByKindAndName,
        )
      : undefined;

  const t = await getTranslations('Customers');
  const numberFormat = new Intl.NumberFormat(locale);
  const schemas = summarizeEntitySchemas(
    entitySchemaNames.map((schemaName) => ({ schemaName, fieldDefs: activeSchemaDefsByKindAndName.get(schemaDefMapKey('entity', schemaName))?.field_defs ?? [] })),
  );
  const totalFields = schemas.reduce((sum, schema) => sum + schema.fieldCount, 0);
  const totalPii = schemas.reduce((sum, schema) => sum + schema.piiCount, 0);
  const okView = view?.kind === 'ok' ? view : null;
  const breakdown = okView ? customerSchemaBreakdown(okView.entries) : [];
  const unavailable =
    view?.kind === 'warehouse_not_configured' ? t('notConfigured') : view?.kind === 'quota_exceeded' ? t('quotaExceeded') : view?.kind === 'query_error' ? t('queryError') : null;
  const lastSeenFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const formatLastSeen = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : lastSeenFormat.format(date);
  };

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Users} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiSchemas')} value={numberFormat.format(schemas.length)} icon={Boxes} />
          <StatCard title={t('kpiFields')} value={numberFormat.format(totalFields)} icon={Fingerprint} />
          <StatCard title={t('kpiPiiFields')} value={numberFormat.format(totalPii)} icon={Lock} subtext={totalPii > 0 ? t('kpiPiiSubtext') : undefined} />
          <StatCard
            title={t('kpiMatches')}
            value={okView ? (okView.hasMore ? t('kpiMatchesCapped', { count: okView.entries.length }) : numberFormat.format(okView.entries.length)) : t('kpiNoValue')}
            icon={Search}
            subtext={okView ? t('kpiMatchesFor', { query: trimmedQuery ?? '' }) : undefined}
          />
        </div>
      </PageHero>

      {entitySchemaNames.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t('noEntitySchemasRegistered')}
          description={t('noEntitySchemasDetail')}
          action={
            <Link href={`/orgs/${orgId}/projects/${projectId}/schema-defs`} className="inline-flex rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
              {t('registerSchemaCta')}
            </Link>
          }
        />
      ) : (
        <>
          <ChartCard title={t('searchCardTitle')} description={t('searchCardDescription')} icon={Search}>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 flex-1 flex-col gap-1">
                <label htmlFor="customer-search-q" className="text-xs font-medium text-muted-foreground">
                  {t('searchLabel')}
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="customer-search-q"
                    name="q"
                    defaultValue={queryParam ?? ''}
                    placeholder={t('searchPlaceholder')}
                    className="h-10 w-full rounded-xl border border-input bg-background pe-3 ps-9 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex min-w-44 flex-col gap-1">
                <label htmlFor="customer-search-schema" className="text-xs font-medium text-muted-foreground">
                  {t('schemaFilterLabel')}
                </label>
                <select
                  id="customer-search-schema"
                  name="schema"
                  defaultValue={selectedSchemaName ?? ''}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="">{t('schemaFilterAll')}</option>
                  {entitySchemaNames.map((schemaName) => (
                    <option key={schemaName} value={schemaName}>
                      {schemaName}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                {t('searchButton')}
              </button>
              {trimmedQuery ? (
                <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/customers` }} className="h-10 rounded-xl px-3 text-sm leading-10 text-muted-foreground underline-offset-4 hover:underline">
                  {t('clearSearch')}
                </Link>
              ) : null}
            </form>
          </ChartCard>

          <section className="flex flex-col gap-6" aria-live="polite">
            {!view ? (
              <EmptyState compact icon={UserRound} title={t('prompt')} description={t('promptDetail')} />
            ) : unavailable ? (
              <EmptyState icon={DatabaseZap} title={unavailable} />
            ) : okView && okView.entries.length === 0 ? (
              <EmptyState icon={SearchX} title={t('empty', { query: trimmedQuery ?? '' })} description={t('emptyDetail')} />
            ) : okView ? (
              <>
                <div className="grid gap-6 lg:grid-cols-5">
                  <ChartCard title={t('breakdownTitle')} description={t('breakdownDescription')} icon={PieChart} className="lg:col-span-2" fill>
                    <DonutChart
                      label={t('breakdownTitle')}
                      size={140}
                      layout="stacked"
                      centerValue={numberFormat.format(okView.entries.length)}
                      centerLabel={t('breakdownCenter')}
                      data={breakdown.map((entry) => ({ label: entry.schemaName, value: entry.count }))}
                    />
                  </ChartCard>
                  <ul className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-3" data-testid="customer-results">
                    {okView.entries.map((entry) => {
                      const displayName = customerDisplayName(entry);
                      return (
                        <li key={`${entry.schemaName}:${entry.entityId}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(var(--gradient-to))] text-sm font-bold text-primary-foreground" aria-hidden="true">
                              {entityInitials(displayName)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-foreground" dir="auto">
                                {displayName}
                              </p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr" title={entry.entityId}>
                                {t('resultEntityIdLine', { entityId: entry.entityId })}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{entry.schemaName}</span>
                          </div>
                          {entry.fields.length > 0 ? (
                            <dl className="grid grid-cols-2 gap-2 text-xs">
                              {entry.fields.map((field) => (
                                <div key={field.name} className="min-w-0 rounded-lg bg-muted/40 px-2 py-1.5">
                                  <dt className="flex items-center gap-1 truncate text-muted-foreground">
                                    {field.isPii ? <Lock className="h-3 w-3 shrink-0" aria-label={t('piiField')} /> : null}
                                    <span className="truncate">{field.name}</span>
                                  </dt>
                                  <dd className={field.isPii ? 'truncate text-muted-foreground' : 'truncate font-medium text-foreground'} dir="auto" title={field.isPii ? undefined : field.value}>
                                    {field.value === '' ? t('fieldEmpty') : field.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {t('resultLastSeenLine', { lastSeenAt: formatLastSeen(entry.lastSeenAt) })}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  {okView.hasMore ? t('capNoteTruncated', { count: okView.entries.length }) : t('capNote', { count: okView.entries.length })}
                </p>
              </>
            ) : null}

            <ChartCard title={t('schemasTitle')} description={t('schemasDescription')} icon={Boxes}>
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <BarList
                    items={schemas.map((schema) => ({
                      key: schema.schemaName,
                      label: schema.schemaName,
                      sublabel: t('schemaPiiSublabel', { count: schema.piiCount }),
                      value: schema.fieldCount,
                    }))}
                    valueFormatter={(value) => t('schemaFieldCount', { count: value })}
                  />
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
                  {schemas.map((schema) => (
                    <li key={schema.schemaName} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{schema.schemaName}</span>
                        {schema.identityKeys.length > 0 ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                            <KeyRound className="h-3 w-3" aria-hidden="true" />
                            <span dir="ltr">{schema.identityKeys.join(', ')}</span>
                          </span>
                        ) : null}
                      </div>
                      {schema.fields.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {schema.fields.map((field) => (
                            <li
                              key={field.name}
                              className={
                                field.isPii
                                  ? 'inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning ring-1 ring-warning/20'
                                  : 'inline-flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] text-foreground ring-1 ring-border'
                              }
                              dir="ltr"
                            >
                              {field.isPii ? <Lock className="h-2.5 w-2.5" aria-label={t('piiField')} /> : null}
                              {field.name}
                              <span className="text-muted-foreground">{field.type}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('schemaNoFields')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>
          </section>
        </>
      )}
    </main>
  );
}

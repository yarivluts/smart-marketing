import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind, buildActiveSchemaDefsByKindAndName } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgProjects,
  listPluginInstallsForProject,
  listSchemaDefinitionsForProject,
  searchProjectCustomers,
  getCustomerExpansionTelemetryForProject,
} from '@/lib/orgs/queries';
import { buildCustomerSearchView } from '@/lib/orgs/customer-search-view';
import { ExpansionRadar } from '@/components/customers/expansion-radar';
import { PpPage, PpCard, ppInputClass } from '@/components/pastel/primitives';
import { Link } from '@/i18n/navigation';

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
 * render at all, same posture as the record feed and segment member list. Gated on `ingest.write`,
 * the same "whole feature, not just mutation, is admin-only" posture the record feed and billing-ops
 * feed pages already establish for browsing raw landed data.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, schemaDefs, installs, initialTelemetry] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
    getCustomerExpansionTelemetryForProject(orgId, projectId).catch(() => undefined),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/customers`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const entitySchemaNames = activeSchemaNamesForKind(schemaDefs, 'entity');
  const activeSchemaDefsByKindAndName = buildActiveSchemaDefsByKindAndName(schemaDefs);
  const selectedSchemaName = schemaParam && entitySchemaNames.includes(schemaParam) ? schemaParam : undefined;
  const trimmedQuery = queryParam?.trim();

  const hasBillingOrCrm = installs.some(
    (i) => i.status === 'installed' && ['stripe', 'chargebee', 'hubspot', 'salesforce'].includes(i.plugin_id.toLowerCase()),
  );
  const isDataConnected = entitySchemaNames.length > 0 || hasBillingOrCrm;

  const view =
    trimmedQuery && trimmedQuery.length > 0
      ? buildCustomerSearchView(
          await searchProjectCustomers(orgId, projectId, trimmedQuery, { schemaName: selectedSchemaName }),
          activeSchemaDefsByKindAndName,
        )
      : undefined;

  const t = await getTranslations({ locale, namespace: 'Customers' });

  return (
    <PpPage className="space-y-10">
      {/* Stitch Expansion & Upgrade Radar */}
      <ExpansionRadar
        orgId={orgId}
        projectId={projectId}
        isDataConnected={isDataConnected}
        initialTelemetry={initialTelemetry}
      />

      {/* Customer 360 Warehouse Search */}
      <PpCard
        title={t('title', { projectName: project.name })}
        subtitle={t('description')}
      >
        {entitySchemaNames.length === 0 ? (
          <p className="text-pp-on-surface-variant font-pp-body-sm text-pp-body-sm">{t('noEntitySchemasRegistered')}</p>
        ) : (
          <div className="space-y-6">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="customer-search-q" className="font-pp-label-sm text-pp-label-sm text-pp-on-surface-variant">
                  {t('searchLabel')}
                </label>
                <input
                  id="customer-search-q"
                  name="q"
                  defaultValue={queryParam ?? ''}
                  placeholder={t('searchPlaceholder')}
                  className={`h-9 rounded-xl px-3 py-1 font-pp-body-sm text-pp-body-sm ${ppInputClass}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="customer-search-schema" className="font-pp-label-sm text-pp-label-sm text-pp-on-surface-variant">
                  {t('schemaFilterLabel')}
                </label>
                <select
                  id="customer-search-schema"
                  name="schema"
                  defaultValue={selectedSchemaName ?? ''}
                  className={`h-9 rounded-xl px-3 py-1 font-pp-body-sm text-pp-body-sm ${ppInputClass}`}
                >
                  <option value="">{t('schemaFilterAll')}</option>
                  {entitySchemaNames.map((schemaName) => (
                    <option key={schemaName} value={schemaName}>
                      {schemaName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="h-9 rounded-full bg-pp-primary px-4 py-1.5 font-pp-label-sm text-pp-label-sm font-bold text-pp-on-primary shadow-pp-candy hover:bg-pp-primary-container transition-all cursor-pointer"
              >
                {t('searchButton')}
              </button>
              {trimmedQuery ? (
                <Link
                  href={{ pathname: `/orgs/${orgId}/projects/${projectId}/customers` }}
                  className="font-pp-body-sm text-xs text-pp-on-surface-variant underline hover:text-pp-on-surface"
                >
                  {t('clearSearch')}
                </Link>
              ) : null}
            </form>

            <div className="flex flex-col gap-3">
              {!view ? (
                <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('prompt')}</p>
              ) : view.kind === 'warehouse_not_configured' ? (
                <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('notConfigured')}</p>
              ) : view.kind === 'quota_exceeded' ? (
                <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('quotaExceeded')}</p>
              ) : view.kind === 'query_error' ? (
                <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('queryError')}</p>
              ) : view.entries.length === 0 ? (
                <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('empty', { query: trimmedQuery ?? '' })}</p>
              ) : (
                <div className="space-y-4">
                  <ul className="flex flex-col gap-2">
                    {view.entries.map((entry) => (
                      <li
                        key={`${entry.schemaName}:${entry.entityId}`}
                        className="flex flex-col gap-1 rounded-2xl border border-pp-outline-variant/50 bg-pp-surface-container-low p-4 font-pp-body-sm text-pp-body-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-pp-label-sm text-pp-label-sm font-bold text-pp-primary">
                            {t('resultSchemaLine', { schemaName: entry.schemaName })}
                          </span>
                          <span className="text-xs text-pp-outline">
                            {t('resultLastSeenLine', { lastSeenAt: entry.lastSeenAt })}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-pp-on-surface-variant">
                          {t('resultEntityIdLine', { entityId: entry.entityId })}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {entry.fields.map((field) => (
                            <div key={field.name} className={field.isPii ? 'text-pp-outline italic' : 'text-pp-on-surface'}>
                              {t('resultFieldLine', { name: field.name, value: field.value })}
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-pp-outline">{t('capNote', { count: view.entries.length })}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </PpCard>
    </PpPage>
  );
}

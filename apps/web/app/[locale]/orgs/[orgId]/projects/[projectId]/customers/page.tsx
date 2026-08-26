import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind, buildActiveSchemaDefsByKindAndName } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSchemaDefinitionsForProject, searchProjectCustomers } from '@/lib/orgs/queries';
import { buildCustomerSearchView } from '@/lib/orgs/customer-search-view';
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

  const [projects, schemaDefs] = await Promise.all([listOrgProjects(orgId), listSchemaDefinitionsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const entitySchemaNames = activeSchemaNamesForKind(schemaDefs, 'entity');
  const activeSchemaDefsByKindAndName = buildActiveSchemaDefsByKindAndName(schemaDefs);
  const selectedSchemaName = schemaParam && entitySchemaNames.includes(schemaParam) ? schemaParam : undefined;
  const trimmedQuery = queryParam?.trim();

  const view =
    trimmedQuery && trimmedQuery.length > 0
      ? buildCustomerSearchView(
          await searchProjectCustomers(orgId, projectId, trimmedQuery, { schemaName: selectedSchemaName }),
          activeSchemaDefsByKindAndName,
        )
      : undefined;

  const t = await getTranslations('Customers');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {entitySchemaNames.length === 0 ? (
        <p className="text-muted-foreground">{t('noEntitySchemasRegistered')}</p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="customer-search-q" className="text-xs text-muted-foreground">
                {t('searchLabel')}
              </label>
              <input
                id="customer-search-q"
                name="q"
                defaultValue={queryParam ?? ''}
                placeholder={t('searchPlaceholder')}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="customer-search-schema" className="text-xs text-muted-foreground">
                {t('schemaFilterLabel')}
              </label>
              <select
                id="customer-search-schema"
                name="schema"
                defaultValue={selectedSchemaName ?? ''}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="">{t('schemaFilterAll')}</option>
                {entitySchemaNames.map((schemaName) => (
                  <option key={schemaName} value={schemaName}>
                    {schemaName}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent">
              {t('searchButton')}
            </button>
            {trimmedQuery ? (
              <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/customers` }} className="text-xs text-muted-foreground underline">
                {t('clearSearch')}
              </Link>
            ) : null}
          </form>

          <section className="flex flex-col gap-3">
            {!view ? (
              <p className="text-muted-foreground">{t('prompt')}</p>
            ) : view.kind === 'warehouse_not_configured' ? (
              <p className="text-muted-foreground">{t('notConfigured')}</p>
            ) : view.kind === 'quota_exceeded' ? (
              <p className="text-muted-foreground">{t('quotaExceeded')}</p>
            ) : view.kind === 'query_error' ? (
              <p className="text-muted-foreground">{t('queryError')}</p>
            ) : view.entries.length === 0 ? (
              <p className="text-muted-foreground">{t('empty', { query: trimmedQuery ?? '' })}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {view.entries.map((entry) => (
                    <li key={`${entry.schemaName}:${entry.entityId}`} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{t('resultSchemaLine', { schemaName: entry.schemaName })}</span>
                        <span className="text-xs text-muted-foreground">{t('resultLastSeenLine', { lastSeenAt: entry.lastSeenAt })}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{t('resultEntityIdLine', { entityId: entry.entityId })}</span>
                      {entry.fields.map((field) => (
                        <span key={field.name} className={field.isPii ? 'text-muted-foreground' : ''}>
                          {t('resultFieldLine', { name: field.name, value: field.value })}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t('capNote', { count: view.entries.length })}</p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

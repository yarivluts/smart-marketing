import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listOrgProjects, listRecentRecordsForSchema, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { toRecordFeedEntryView } from '@/lib/orgs/record-feed-view';
import { Link } from '@/i18n/navigation';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ schema?: string }>;
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
 * projection leaves the server. Gated on `ingest.write`, same "whole feature, not just mutation, is
 * admin-only" posture as the billing-ops feed and ingest-health pages, since this exposes raw landed
 * payloads.
 */
export default async function RecordFeedPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { schema: schemaParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Frecord-feed`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, schemaDefs, environments] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const selectedSchemaName = schemaParam && eventSchemaNames.includes(schemaParam) ? schemaParam : eventSchemaNames[0];
  const selectedSchemaDef = schemaDefs.find((def) => def.kind === 'event' && def.status === 'active' && def.name === selectedSchemaName);

  const records = selectedSchemaName ? await listRecentRecordsForSchema(orgId, projectId, 'event', selectedSchemaName) : [];
  const entries = records.map((record) => toRecordFeedEntryView(record, selectedSchemaDef?.field_defs ?? []));

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

          <section className="flex flex-col gap-3">
            {entries.length === 0 ? (
              <p className="text-muted-foreground">{t('empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                      </span>
                      <span className="text-xs text-muted-foreground">{t('landedAtLine', { landedAt: entry.landedAt })}</span>
                    </div>
                    {entry.fields.map((field) => (
                      <span key={field.name} className={field.isPii ? 'text-muted-foreground' : ''}>
                        {t('fieldLine', { name: field.name, value: field.value })}
                      </span>
                    ))}
                    <span className="text-xs text-muted-foreground">{t('clientIdLine', { clientId: entry.clientId })}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t('capNote', { count: entries.length })}</p>
          </section>
        </>
      )}
    </main>
  );
}

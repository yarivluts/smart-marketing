import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getEventVolumeOverviewForProject,
  listEnvironmentsForProject,
  listOrgProjects,
  listQuarantinedRecordsForProject,
  listSchemaDefinitionsForProject,
  listTrackingAlertsForProject,
} from '@/lib/orgs/queries';
import { Link } from '@/i18n/navigation';
import { toSchemaDefView, type SchemaDefView } from '@/lib/orgs/schema-def-view';
import { toTrackingAlertView, trackingAlertStatusLabelKey } from '@/lib/orgs/tracking-alert-view';
import { RegisterSchemaDefForm } from '@/components/orgs/register-schema-def-form';
import { SchemaFamilyCard, type SchemaVersionView } from '@/components/orgs/schema-family-card';
import { CheckTrackingAlertsButton } from '@/components/orgs/check-tracking-alerts-button';
import { SyncSchemaMartsButton } from '@/components/orgs/sync-schema-marts-button';
import { EventVolumeSparkline } from '@/components/orgs/event-volume-sparkline';
import { RegisterTouchpointSchemaButton } from '@/components/orgs/register-touchpoint-schema-button';

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

/**
 * A project's Schema Registry (KAN-31): every registered entity/event/measure
 * schema, every version of each ("register v1 -> evolve to v2 -> both
 * queryable"), and a form to register a new one or evolve an existing family
 * to its next version. Gated on `schema.write` for the whole page — same
 * "whole feature, not just mutation, is admin-only" posture as KAN-30's keys
 * page, since a schema's field list (including which fields carry PII) is
 * sensitive enough to keep to roles trusted to manage it.
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

  const [projects, schemaDefs, trackingAlerts, environments] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    listTrackingAlertsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // Reuses the schema-defs list just fetched above rather than a second, redundant
  // Firestore read of the same collection (same `precomputedQuota`-style pass-through
  // pattern the cost-guardrails page uses for its own equivalent duplicate fetch).
  const eventVolumeOverview = await getEventVolumeOverviewForProject(orgId, projectId, { precomputedSchemaDefs: schemaDefs });

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
  const quarantinedSample = await listQuarantinedRecordsForProject(orgId, projectId, QUARANTINE_SAMPLE_SIZE);
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('touchpointCaptureHeading')}</h2>
          {!touchpointSchemaRegistered ? <RegisterTouchpointSchemaButton orgId={orgId} projectId={projectId} /> : null}
        </div>
        <p className="text-muted-foreground">
          {touchpointSchemaRegistered ? t('touchpointSchemaAlreadyRegistered') : t('touchpointSchemaIntro')}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('registeredHeading')}</h2>
          <SyncSchemaMartsButton orgId={orgId} projectId={projectId} />
        </div>
        {families.length === 0 ? (
          <p className="text-muted-foreground">{t('noSchemas')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
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
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('eventVolumeHeading')}</h2>
          <CheckTrackingAlertsButton orgId={orgId} projectId={projectId} />
        </div>

        {quarantinedSample.length >= QUARANTINE_SAMPLE_SIZE ? (
          <p className="text-xs text-muted-foreground">{t('eventRejectedSampleNote', { sampled: QUARANTINE_SAMPLE_SIZE })}</p>
        ) : null}
        {eventVolumeOverview.length === 0 ? (
          <p className="text-muted-foreground">{t('noEventSchemas')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventVolumeOverview.map((entry) => (
              <li
                key={`${entry.schemaName}:${entry.environmentId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {t('eventVolumeSchemaEnvironmentLabel', { schemaName: entry.schemaName, environmentName: tEnv(entry.environmentName) })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.lastSeenAt === null ? t('eventNeverSeen') : t('eventLastSeen', { lastSeenAt: entry.lastSeenAt })}
                  </span>
                  {(rejectedCountByKey.get(`${entry.schemaName}:${entry.environmentId}`) ?? 0) > 0 ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {t('eventRejectedCount', { count: rejectedCountByKey.get(`${entry.schemaName}:${entry.environmentId}`) ?? 0 })}{' '}
                      <Link className="underline" href={`/orgs/${orgId}/projects/${projectId}/ingest-health`}>
                        {t('eventRejectedLink')}
                      </Link>
                    </span>
                  ) : null}
                </div>
                <EventVolumeSparkline dailyCounts={entry.dailyCounts} />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('trackingAlertsHeading')}</h3>
          {trackingAlertViews.length === 0 ? (
            <p className="text-muted-foreground">{t('noTrackingAlerts')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {trackingAlertViews.map((alert) => (
                <li key={alert.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                  <span className="font-medium">
                    {t('trackingAlertSummary', {
                      schemaName: alert.schemaName,
                      environmentName: tEnv(alert.environmentName),
                      status: t(trackingAlertStatusLabelKey(alert.status)),
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('trackingAlertLastSeen', { lastSeenAt: alert.lastSeenAt })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registerHeading')}</h2>
        <RegisterSchemaDefForm orgId={orgId} projectId={projectId} />
      </section>
    </main>
  );
}

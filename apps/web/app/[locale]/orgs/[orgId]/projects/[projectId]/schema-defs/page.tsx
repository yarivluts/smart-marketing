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
  listSchemaDefinitionsForProject,
  listTrackingAlertsForProject,
} from '@/lib/orgs/queries';
import { toSchemaDefView, type SchemaDefView } from '@/lib/orgs/schema-def-view';
import { toTrackingAlertView, trackingAlertStatusLabelKey } from '@/lib/orgs/tracking-alert-view';
import { RegisterSchemaDefForm } from '@/components/orgs/register-schema-def-form';
import { SchemaFamilyCard, type SchemaVersionView } from '@/components/orgs/schema-family-card';
import { CheckTrackingAlertsButton } from '@/components/orgs/check-tracking-alerts-button';
import { SyncSchemaMartsButton } from '@/components/orgs/sync-schema-marts-button';
import { EventVolumeSparkline } from '@/components/orgs/event-volume-sparkline';
import { RegisterTouchpointSchemaButton } from '@/components/orgs/register-touchpoint-schema-button';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { Layers, Activity, PlusCircle, Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';

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
 * A project's Schema Registry: every registered entity/event/measure schema,
 * version evolution, event volume sparklines, and tracking alerts.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId })) {
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
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/schema-defs`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const eventVolumeOverview = await getEventVolumeOverviewForProject(orgId, projectId, { precomputedSchemaDefs: schemaDefs });
  const families = groupIntoFamilies(schemaDefs.map(toSchemaDefView));
  const environmentNameById = new Map(environments.map((environment) => [environment.id, environment.name]));
  const trackingAlertViews = trackingAlerts.map((alert) =>
    toTrackingAlertView(alert, environmentNameById.get(alert.environment_id) ?? alert.environment_id),
  );
  const touchpointSchemaRegistered = schemaDefs.some((schemaDef) => schemaDef.kind === 'event' && schemaDef.name === 'touchpoint');

  const t = await getTranslations('SchemaRegistry');
  const tEnv = await getTranslations('EnvBadge');

  const activeSchemasCount = schemaDefs.filter((d) => d.status === 'active').length;
  const eventSchemasCount = schemaDefs.filter((d) => d.kind === 'event').length;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        meta={`${families.length} families · ${schemaDefs.length} versions`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <SyncSchemaMartsButton orgId={orgId} projectId={projectId} />
            {!touchpointSchemaRegistered ? <RegisterTouchpointSchemaButton orgId={orgId} projectId={projectId} /> : null}
          </div>
        }
      />

      {/* KPI Grid */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiContractFamilies')}
          value={families.length}
          accent="primary"
          badge={`${families.length} Families`}
          badgeAccent="primary"
        />
        <PpKpiCard
          label={t('kpiActiveSchemas')}
          value={activeSchemasCount}
          accent="mint"
          badge="Active"
          badgeAccent="mint"
        />
        <PpKpiCard
          label={t('kpiEventSchemas')}
          value={eventSchemasCount}
          accent="sky"
          badge="Events"
          badgeAccent="sky"
        />
        <PpKpiCard
          label={t('kpiTrackingAlerts')}
          value={trackingAlertViews.length}
          accent={trackingAlertViews.length > 0 ? 'amber' : 'neutral'}
          badge={trackingAlertViews.length > 0 ? 'Alerts' : 'Healthy'}
          badgeAccent={trackingAlertViews.length > 0 ? 'amber' : 'neutral'}
        />
      </PpKpiGrid>

      {/* Touchpoint Schema Status Banner */}
      <PpCard
        title={t('touchpointCaptureHeading')}
        subtitle={touchpointSchemaRegistered ? t('touchpointSchemaAlreadyRegistered') : t('touchpointSchemaIntro')}
        icon={touchpointSchemaRegistered ? ShieldCheck : Sparkles}
        iconAccent={touchpointSchemaRegistered ? 'mint' : 'primary'}
        action={
          !touchpointSchemaRegistered ? (
            <RegisterTouchpointSchemaButton orgId={orgId} projectId={projectId} />
          ) : (
            <PpPill accent="mint" dot>Registered</PpPill>
          )
        }
      >
        <div className="text-pp-body-sm text-pp-on-surface-variant">
          {touchpointSchemaRegistered
            ? 'Touchpoint event capture is active and verified across web & CAPI edge endpoints.'
            : 'Initialize the standardized touchpoint event contract to ingest multi-touch attribution events.'}
        </div>
      </PpCard>

      {/* Registered Schemas Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-lg text-pp-on-surface">
            {t('registeredHeading')}
          </h2>
          <span className="text-pp-label-sm text-pp-outline font-bold uppercase tracking-wider">
            {families.length} {families.length === 1 ? 'Family' : 'Families'}
          </span>
        </div>

        {families.length === 0 ? (
          <PpEmptyState
            icon={Layers}
            title={t('noSchemas')}
            description={t('noSchemasDesc')}
          />
        ) : (
          <ul className="flex flex-col gap-4 list-none p-0 m-0">
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

      {/* Event Volume & Tracking Alerts Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-lg text-pp-on-surface">
            {t('eventVolumeHeading')}
          </h2>
          <CheckTrackingAlertsButton orgId={orgId} projectId={projectId} />
        </div>

        {eventVolumeOverview.length === 0 ? (
          <PpCard>
            <p className="text-pp-on-surface-variant text-pp-body-md">{t('noEventSchemas')}</p>
          </PpCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventVolumeOverview.map((entry) => (
              <PpCard
                key={`${entry.schemaName}:${entry.environmentId}`}
                title={entry.schemaName}
                subtitle={
                  entry.lastSeenAt === null
                    ? t('eventNeverSeen')
                    : t('eventLastSeen', { lastSeenAt: entry.lastSeenAt })
                }
                icon={Activity}
                iconAccent="sky"
                action={<PpPill accent="mint">{tEnv(entry.environmentName)}</PpPill>}
              >
                <div className="flex items-center justify-between gap-4 pt-2">
                  <div className="text-pp-body-sm text-pp-outline font-medium">
                    {t('eventVolumeSchemaEnvironmentLabel', {
                      schemaName: entry.schemaName,
                      environmentName: tEnv(entry.environmentName),
                    })}
                  </div>
                  <EventVolumeSparkline dailyCounts={entry.dailyCounts} />
                </div>
              </PpCard>
            ))}
          </div>
        )}

        {/* Tracking Alerts List */}
        <div className="space-y-3 pt-2">
          <h3 className="font-pp-display text-pp-headline-md text-pp-on-surface">
            {t('trackingAlertsHeading')}
          </h3>
          {trackingAlertViews.length === 0 ? (
            <div className="rounded-2xl bg-pp-surface-container-low/60 p-4 text-pp-body-sm text-pp-on-surface-variant">
              {t('noTrackingAlerts')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {trackingAlertViews.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-pp-surface-container-lowest p-4 shadow-pp-candy border border-pp-outline-variant/20"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden />
                    <div>
                      <div className="font-medium text-pp-on-surface text-pp-body-md">
                        {t('trackingAlertSummary', {
                          schemaName: alert.schemaName,
                          environmentName: tEnv(alert.environmentName),
                          status: t(trackingAlertStatusLabelKey(alert.status)),
                        })}
                      </div>
                      <div className="text-xs text-pp-outline">
                        {t('trackingAlertLastSeen', { lastSeenAt: alert.lastSeenAt })}
                      </div>
                    </div>
                  </div>
                  <PpPill accent={alert.status === 'active' ? 'amber' : 'neutral'}>
                    {t(trackingAlertStatusLabelKey(alert.status))}
                  </PpPill>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Register New Schema Section */}
      <PpCard
        title={t('registerHeading')}
        subtitle="Define a new schema contract for events, entities, or measures"
        icon={PlusCircle}
        iconAccent="primary"
      >
        <RegisterSchemaDefForm orgId={orgId} projectId={projectId} />
      </PpCard>
    </PpPage>
  );
}

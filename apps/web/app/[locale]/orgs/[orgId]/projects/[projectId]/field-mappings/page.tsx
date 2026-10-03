import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listEnvironmentsForProject,
  listFieldMappingsForProject,
  listHookDeliveriesForProject,
  listHookEndpointsForProject,
  listOrgProjects,
  listSchemaDefinitionsForProject,
} from '@/lib/orgs/queries';
import { CreateFieldMappingForm } from '@/components/orgs/create-field-mapping-form';
import { DisableFieldMappingButton } from '@/components/orgs/disable-field-mapping-button';
import { EditFieldMappingForm } from '@/components/orgs/edit-field-mapping-form';
import { EnableFieldMappingButton } from '@/components/orgs/enable-field-mapping-button';
import { TestRunFieldMappingPanel } from '@/components/orgs/test-run-field-mapping-panel';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { Workflow, PlusCircle, ArrowRight, ShieldCheck, Layers } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

const FIELD_MAPPING_KINDS = ['event', 'entity', 'measure'] as const;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'FieldMappings' });
  return { title: t('metaTitle') };
}

/**
 * A project's saved field mappings: turn raw inbound payloads into schema-valid records.
 */
export default async function ProjectFieldMappingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffield-mappings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/field-mappings`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [environments, hookEndpoints, hookDeliveries, fieldMappings, schemaDefs] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listHookEndpointsForProject(orgId, projectId),
    listHookDeliveriesForProject(orgId, projectId),
    listFieldMappingsForProject(orgId, projectId),
    listSchemaDefinitionsForProject(orgId, projectId),
  ]);

  const t = await getTranslations('FieldMappings');
  const tEnv = await getTranslations('EnvBadge');
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));
  const hookEndpointOptions = hookEndpoints.filter((endpoint) => !endpoint.disabled_at).map((endpoint) => ({ id: endpoint.id, name: endpoint.name }));
  const hookEndpointNameById = new Map(hookEndpoints.map((endpoint) => [endpoint.id, endpoint.name]));
  const pendingHookDeliveries = hookDeliveries
    .filter((delivery) => delivery.status === 'pending')
    .map((delivery) => ({ id: delivery.id, receivedAt: delivery.received_at }));

  const schemaNamesByKind = Object.fromEntries(
    FIELD_MAPPING_KINDS.map((kind) => [
      kind,
      [...new Set(schemaDefs.filter((def) => def.kind === kind && def.status === 'active').map((def) => def.name))].sort(),
    ]),
  ) as Record<(typeof FIELD_MAPPING_KINDS)[number], string[]>;

  const activeMappingsCount = fieldMappings.filter((m) => !m.disabled_at).length;
  const disabledMappingsCount = fieldMappings.filter((m) => Boolean(m.disabled_at)).length;
  const distinctTargetSchemasCount = new Set(fieldMappings.map((m) => m.schema_name)).size;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        meta={`${fieldMappings.length} mappings`}
      />

      {/* KPI Grid */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiTotalMappings')}
          value={fieldMappings.length}
          accent="primary"
          badge={`${fieldMappings.length} Total`}
          badgeAccent="primary"
        />
        <PpKpiCard
          label={t('kpiActiveMappings')}
          value={activeMappingsCount}
          accent="mint"
          badge="Active"
          badgeAccent="mint"
        />
        <PpKpiCard
          label={t('kpiDisabledMappings')}
          value={disabledMappingsCount}
          accent={disabledMappingsCount > 0 ? 'amber' : 'neutral'}
          badge="Disabled"
          badgeAccent="neutral"
        />
        <PpKpiCard
          label={t('kpiTargetSchemas')}
          value={distinctTargetSchemasCount}
          accent="sky"
          badge="Schemas"
          badgeAccent="sky"
        />
      </PpKpiGrid>

      {/* Existing Mappings Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-lg text-pp-on-surface">
            {t('existingMappingsHeading')}
          </h2>
          <span className="text-pp-label-sm text-pp-outline font-bold uppercase tracking-wider">
            {fieldMappings.length} {fieldMappings.length === 1 ? 'Mapping' : 'Mappings'}
          </span>
        </div>

        {fieldMappings.length === 0 ? (
          <PpEmptyState
            icon={Workflow}
            title={t('noMappings')}
            description={t('noMappingsDesc')}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {fieldMappings.map((mapping) => {
              const environmentName = environmentNameById.get(mapping.environment_id);
              const hookEndpointName = mapping.hook_endpoint_id ? hookEndpointNameById.get(mapping.hook_endpoint_id) : undefined;
              return (
                <PpCard
                  key={mapping.id}
                  title={mapping.name}
                  subtitle={
                    <span>
                      {t('mappingSummary', {
                        kind: mapping.kind,
                        schemaName: mapping.schema_name,
                        environment: environmentName ? tEnv(environmentName) : '',
                      })}
                      {hookEndpointName ? ` · ${hookEndpointName}` : ''}
                    </span>
                  }
                  icon={Workflow}
                  iconAccent={mapping.disabled_at ? 'neutral' : 'primary'}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <PpPill accent="primary">{mapping.kind}</PpPill>
                      <PpPill accent="sky">{mapping.schema_name}</PpPill>
                      {environmentName ? (
                        <PpPill accent="mint">{tEnv(environmentName)}</PpPill>
                      ) : null}
                      {mapping.disabled_at ? (
                        <PpPill accent="neutral">{t('disabledLabel')}</PpPill>
                      ) : (
                        <PpPill accent="mint" dot>Active</PpPill>
                      )}
                      {!mapping.disabled_at ? (
                        <DisableFieldMappingButton orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} />
                      ) : (
                        <EnableFieldMappingButton orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} />
                      )}
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* Transformation Rules summary */}
                    {mapping.rules.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-pp-label-sm uppercase tracking-wider text-pp-outline font-bold">
                          {t('rulesCount', { count: mapping.rules.length })}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {mapping.rules.map((rule, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 rounded-xl bg-pp-surface-container-low/70 px-3 py-2 text-xs border border-pp-outline-variant/20"
                            >
                              <div className="flex items-center gap-2 min-w-0 font-mono">
                                <span className="font-bold text-pp-primary shrink-0">
                                  {rule.sourcePath || rule.staticValue || rule.template || '—'}
                                </span>
                                <ArrowRight className="h-3 w-3 text-pp-outline shrink-0 rtl:rotate-180" aria-hidden />
                                <span className="font-bold text-pp-on-surface truncate">
                                  {rule.targetField}
                                </span>
                              </div>
                              <span className="rounded-full bg-pp-surface-container px-2 py-0.5 text-[10px] font-semibold text-pp-on-surface-variant shrink-0">
                                {rule.transform}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Actions and Editors */}
                    <div className="flex flex-col gap-3 pt-2 border-t border-pp-outline-variant/20">
                      <div className="flex flex-wrap items-center gap-3">
                        <EditFieldMappingForm
                          orgId={orgId}
                          projectId={projectId}
                          fieldMappingId={mapping.id}
                          initialName={mapping.name}
                          initialSchemaName={mapping.schema_name}
                          initialRules={mapping.rules}
                          schemaOptions={schemaNamesByKind[mapping.kind]}
                        />
                        <TestRunFieldMappingPanel
                          orgId={orgId}
                          projectId={projectId}
                          fieldMappingId={mapping.id}
                          hookDeliveries={pendingHookDeliveries}
                        />
                      </div>
                    </div>
                  </div>
                </PpCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Create Mapping Section */}
      <PpCard
        title={t('createMappingHeading')}
        subtitle="Define new transformation rules from inbound payloads into registered contracts"
        icon={PlusCircle}
        iconAccent="primary"
      >
        {environmentOptions.length === 0 ? (
          <p className="text-pp-on-surface-variant text-pp-body-md">{t('noEnvironments')}</p>
        ) : (
          <CreateFieldMappingForm
            orgId={orgId}
            projectId={projectId}
            environments={environmentOptions}
            hookEndpoints={hookEndpointOptions}
            schemaNamesByKind={schemaNamesByKind}
          />
        )}
      </PpCard>
    </PpPage>
  );
}

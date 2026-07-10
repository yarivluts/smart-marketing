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
import { TestRunFieldMappingPanel } from '@/components/orgs/test-run-field-mapping-panel';

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
 * A project's saved field mappings (KAN-54, E9.2): turn a raw inbound-webhook
 * payload (KAN-53's review queue) into a schema-valid ingest record via
 * JSONPath-to-field rules. Create a mapping targeting a currently-registered
 * schema (KAN-31), test it against a pasted sample or a real queued
 * delivery without persisting anything, and retire a mapping when it's no
 * longer needed. Gated on `ingest.write`, the same permission the sibling
 * Hooks admin surface (KAN-53) reuses for inbound-data management.
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
    notFound();
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('existingMappingsHeading')}</h2>
        {fieldMappings.length === 0 ? (
          <p className="text-muted-foreground">{t('noMappings')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fieldMappings.map((mapping) => {
              const environmentName = environmentNameById.get(mapping.environment_id);
              const hookEndpointName = mapping.hook_endpoint_id ? hookEndpointNameById.get(mapping.hook_endpoint_id) : undefined;
              return (
                <li key={mapping.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{mapping.name}</span>
                      <span className="text-muted-foreground">
                        {t('mappingSummary', {
                          kind: mapping.kind,
                          schemaName: mapping.schema_name,
                          environment: environmentName ? tEnv(environmentName) : '',
                        })}
                        {hookEndpointName ? ` · ${hookEndpointName}` : ''}
                      </span>
                      {mapping.disabled_at ? <span className="text-muted-foreground">{t('disabledLabel')}</span> : null}
                    </div>
                    {!mapping.disabled_at ? (
                      <DisableFieldMappingButton orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} />
                    ) : null}
                  </div>
                  <TestRunFieldMappingPanel
                    orgId={orgId}
                    projectId={projectId}
                    fieldMappingId={mapping.id}
                    hookDeliveries={pendingHookDeliveries}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createMappingHeading')}</h2>
        {environmentOptions.length === 0 ? (
          <p className="text-muted-foreground">{t('noEnvironments')}</p>
        ) : (
          <CreateFieldMappingForm
            orgId={orgId}
            projectId={projectId}
            environments={environmentOptions}
            hookEndpoints={hookEndpointOptions}
            schemaNamesByKind={schemaNamesByKind}
          />
        )}
      </section>
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, type MappingRule } from '@growthos/shared';
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
import { buildMappingFlow, transformMix, type MappingFlowNode } from '@/lib/orgs/field-mapping-flow';
import { CreateFieldMappingForm } from '@/components/orgs/create-field-mapping-form';
import { DisableFieldMappingButton } from '@/components/orgs/disable-field-mapping-button';
import { EditFieldMappingForm } from '@/components/orgs/edit-field-mapping-form';
import { EnableFieldMappingButton } from '@/components/orgs/enable-field-mapping-button';
import { TestRunFieldMappingPanel } from '@/components/orgs/test-run-field-mapping-panel';
import { SchemaKindIcon } from '@/components/orgs/schema-kind-icon';
import { StatCard } from '@/components/ui/stat-card';
import { Link } from '@/i18n/navigation';
import { ChartCard, DonutChart, EmptyState, FlowDiagram, PageHero, type FlowNodeSpec } from '@/components/viz';
import { cn } from '@/lib/utils';
import { ArrowRight, Inbox, ListTree, Plus, Shuffle, Webhook, Workflow } from 'lucide-react';

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
 *
 * The page opens on the whole pipeline as a diagram (hook endpoint -> mapping -> target schema) and
 * shows each mapping's rules as source-to-target rows, so what a payload turns into is visible
 * without opening the editor.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
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
  const numberFormat = new Intl.NumberFormat(locale);
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));
  const hookEndpointOptions = hookEndpoints.filter((endpoint) => !endpoint.disabled_at).map((endpoint) => ({ id: endpoint.id, name: endpoint.name }));
  const hookEndpointNameById = new Map(hookEndpoints.map((endpoint) => [endpoint.id, endpoint.name]));
  const pendingDeliveries = hookDeliveries.filter((delivery) => delivery.status === 'pending');
  const pendingHookDeliveries = pendingDeliveries.map((delivery) => ({ id: delivery.id, receivedAt: delivery.received_at }));

  const schemaNamesByKind = Object.fromEntries(
    FIELD_MAPPING_KINDS.map((kind) => [
      kind,
      [...new Set(schemaDefs.filter((def) => def.kind === kind && def.status === 'active').map((def) => def.name))].sort(),
    ]),
  ) as Record<(typeof FIELD_MAPPING_KINDS)[number], string[]>;

  // Everything below is derived from the five reads above.
  const activeMappings = fieldMappings.filter((mapping) => !mapping.disabled_at);
  const allRules: MappingRule[] = fieldMappings.flatMap((mapping) => mapping.rules);
  const appliedCount = hookDeliveries.filter((delivery) => delivery.applied_at).length;
  const pendingByEndpoint = new Map<string, number>();
  for (const delivery of pendingDeliveries) {
    pendingByEndpoint.set(delivery.hook_endpoint_id, (pendingByEndpoint.get(delivery.hook_endpoint_id) ?? 0) + 1);
  }
  const activeSchemaKeys = new Set(schemaDefs.filter((def) => def.status === 'active').map((def) => `${def.kind}:${def.name}`));
  const flow = buildMappingFlow(
    fieldMappings.map((mapping) => ({
      id: mapping.id,
      name: mapping.name,
      kind: mapping.kind,
      schemaName: mapping.schema_name,
      hookEndpointId: mapping.hook_endpoint_id,
      disabled: Boolean(mapping.disabled_at),
      ruleCount: mapping.rules.length,
    })),
    hookEndpoints.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, disabled: Boolean(endpoint.disabled_at), pendingCount: pendingByEndpoint.get(endpoint.id) ?? 0 })),
    activeSchemaKeys,
  );
  const base = `/orgs/${orgId}/projects/${projectId}`;
  const flowNode = (node: MappingFlowNode): FlowNodeSpec => {
    if (node.type === 'any_source') {
      return { id: node.id, label: t('flowAnySource'), sublabel: t('flowAnySourceSub'), status: 'ok', href: `${base}/hooks` };
    }
    if (node.type === 'endpoint') {
      return {
        id: node.id,
        label: node.name,
        sublabel: node.disabled ? t('disabledLabel') : node.healthy ? t('flowPendingSub', { count: node.count }) : t('flowUnmappedSub', { count: node.count }),
        value: node.count > 0 ? numberFormat.format(node.count) : undefined,
        status: node.disabled ? 'idle' : !node.healthy && node.count > 0 ? 'warn' : node.healthy ? 'ok' : 'idle',
        href: `${base}/hooks`,
      };
    }
    if (node.type === 'mapping') {
      return {
        id: node.id,
        label: node.name,
        sublabel: node.disabled ? t('disabledLabel') : t('flowRulesSub', { count: node.count }),
        status: node.disabled ? 'idle' : 'ok',
        href: `${base}/field-mappings#mapping-${node.refId}`,
      };
    }
    return {
      id: node.id,
      label: node.name,
      sublabel: node.healthy ? t('flowSchemaSub', { kind: node.kind ?? '' }) : t('flowSchemaMissingSub'),
      status: node.healthy ? 'ok' : 'error',
      href: `${base}/schema-defs`,
    };
  };
  const flowColumnHeight = Math.max(
    flow.nodes.filter((node) => node.type === 'endpoint' || node.type === 'any_source').length,
    flow.nodes.filter((node) => node.type === 'mapping').length,
    flow.nodes.filter((node) => node.type === 'schema').length,
    1,
  );
  const mix = transformMix(allRules);

  function ruleSource(rule: MappingRule): string {
    if (rule.transform === 'static') return t('ruleStaticSource', { value: rule.staticValue ?? '' });
    if (rule.transform === 'template') return rule.template ?? '';
    return rule.sourcePath ?? '';
  }

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Shuffle} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiActiveMappings')} value={`${numberFormat.format(activeMappings.length)}/${numberFormat.format(fieldMappings.length)}`} icon={Workflow} />
          <StatCard title={t('kpiRules')} value={numberFormat.format(allRules.length)} icon={ListTree} />
          <StatCard title={t('kpiPending')} value={numberFormat.format(pendingDeliveries.length)} subtext={t('kpiPendingSub')} icon={Inbox} />
          <StatCard title={t('kpiApplied')} value={numberFormat.format(appliedCount)} subtext={t('kpiAppliedSub')} icon={Webhook} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={Workflow} className="lg:col-span-2" fill>
          {flow.nodes.length > 0 && fieldMappings.length > 0 ? (
            <FlowDiagram
              label={t('flowTitle')}
              nodes={flow.nodes.map(flowNode)}
              edges={flow.edges.map((edge) => ({ source: edge.source, target: edge.target, animated: edge.active, status: edge.active ? ('ok' as const) : ('idle' as const) }))}
              height={Math.min(520, Math.max(260, 120 * flowColumnHeight))}
            />
          ) : (
            <EmptyState
              compact
              icon={Workflow}
              title={t('flowEmpty')}
              description={t('flowEmptyDetail')}
              action={
                <Link href={`${base}/hooks`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {t('flowHooksLink')}
                </Link>
              }
            />
          )}
        </ChartCard>
        <ChartCard title={t('mixTitle')} description={t('mixDescription')} icon={ListTree} fill>
          {mix.length > 0 ? (
            <DonutChart
              label={t('mixTitle')}
              centerValue={numberFormat.format(allRules.length)}
              centerLabel={t('mixCenter')}
              data={mix.map((entry) => ({ label: entry.transform, value: entry.count }))}
              size={150}
              layout="stacked"
            />
          ) : (
            <EmptyState compact icon={ListTree} title={t('mixEmpty')} />
          )}
        </ChartCard>
      </div>

      <ChartCard title={t('existingMappingsHeading')} icon={Shuffle}>
        {fieldMappings.length === 0 ? (
          <EmptyState compact icon={Shuffle} title={t('noMappings')} description={t('noMappingsDetail')} />
        ) : (
          <ul className="flex flex-col gap-4">
            {fieldMappings.map((mapping) => {
              const environmentName = environmentNameById.get(mapping.environment_id);
              const hookEndpointName = mapping.hook_endpoint_id ? hookEndpointNameById.get(mapping.hook_endpoint_id) : undefined;
              const schemaRegistered = activeSchemaKeys.has(`${mapping.kind}:${mapping.schema_name}`);
              return (
                <li
                  key={mapping.id}
                  id={`mapping-${mapping.id}`}
                  className={cn('flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm', mapping.disabled_at && 'opacity-75')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <SchemaKindIcon kind={mapping.kind} />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold">{mapping.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {t('mappingSummary', {
                            kind: mapping.kind,
                            schemaName: mapping.schema_name,
                            environment: environmentName ? tEnv(environmentName) : '',
                          })}
                          {hookEndpointName ? ` · ${hookEndpointName}` : ''}
                        </span>
                        {mapping.disabled_at ? (
                          <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t('disabledLabel')}</span>
                        ) : null}
                      </div>
                    </div>
                    {!mapping.disabled_at ? (
                      <DisableFieldMappingButton orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} />
                    ) : (
                      <EnableFieldMappingButton orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} />
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border/70">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <span>{t('rulesSourceHeader')}</span>
                      <span className="text-center">{t('transformHeader')}</span>
                      <span className="text-end">
                        {t('rulesTargetHeader', { schemaName: mapping.schema_name })}
                        {!schemaRegistered ? <span className="ms-1 text-destructive">{t('rulesTargetMissing')}</span> : null}
                      </span>
                    </div>
                    {mapping.rules.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">{t('rulesNone')}</p>
                    ) : (
                      <ol className="divide-y divide-border/60">
                        {mapping.rules.map((rule) => (
                          <li key={rule.targetField} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5 text-xs">
                            <code className={cn('truncate font-mono', rule.transform === 'static' ? 'text-muted-foreground' : 'text-foreground')} dir="ltr" title={ruleSource(rule)}>
                              {ruleSource(rule)}
                            </code>
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              {rule.transform}
                              {rule.castType ? ` ${rule.castType}` : ''}
                              <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
                            </span>
                            <code className="truncate text-end font-mono text-foreground" dir="ltr" title={rule.targetField}>
                              {rule.targetField}
                            </code>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <EditFieldMappingForm
                      orgId={orgId}
                      projectId={projectId}
                      fieldMappingId={mapping.id}
                      initialName={mapping.name}
                      initialSchemaName={mapping.schema_name}
                      initialRules={mapping.rules}
                      schemaOptions={schemaNamesByKind[mapping.kind]}
                    />
                    <TestRunFieldMappingPanel orgId={orgId} projectId={projectId} fieldMappingId={mapping.id} hookDeliveries={pendingHookDeliveries} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ChartCard>

      <ChartCard title={t('createMappingHeading')} description={t('createMappingDescription')} icon={Plus}>
        {environmentOptions.length === 0 ? (
          <EmptyState compact icon={Plus} title={t('noEnvironments')} />
        ) : (
          <CreateFieldMappingForm
            orgId={orgId}
            projectId={projectId}
            environments={environmentOptions}
            hookEndpoints={hookEndpointOptions}
            schemaNamesByKind={schemaNamesByKind}
          />
        )}
      </ChartCard>
    </div>
  );
}

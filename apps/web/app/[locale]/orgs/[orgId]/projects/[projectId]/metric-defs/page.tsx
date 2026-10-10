import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listMetricDefinitionsForProject, listOrgProjects, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { toMetricDefView, type MetricDefView } from '@/lib/orgs/metric-def-view';
import {
  buildMetricLineage,
  catalogStats,
  formulaSharePercent,
  metricTypeSlices,
  pickLineageFocus,
  tallestLineageColumn,
  toCatalogMetrics,
  type LineageNode,
} from '@/lib/orgs/metric-lineage';
import { RegisterMetricDefForm } from '@/components/orgs/register-metric-def-form';
import { MetricFamilyCard } from '@/components/orgs/metric-family-card';
import type { MetricVersionView } from '@/components/orgs/metric-definition-editor';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, FlowDiagram, PageHero, type FlowNodeSpec } from '@/components/viz';
import { Archive, BookOpenCheck, Database, FilePlus2, FunctionSquare, GitBranch, History, Recycle, Sigma } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ metric?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'MetricRegistry' });
  return { title: t('metaTitle') };
}

interface MetricFamily {
  name: string;
  versions: MetricVersionView[];
}

// Client components only ever receive plain serializable data (never an
// `@arbel/firebase-orm` model instance) — reuses the same field mapping the
// API routes use (`toMetricDefView`) rather than a second, independently
// maintained copy of it.
function groupIntoFamilies(views: readonly MetricDefView[]): MetricFamily[] {
  const familiesByName = new Map<string, MetricFamily>();
  for (const view of views) {
    const family = familiesByName.get(view.name) ?? { name: view.name, versions: [] };
    family.versions.push({
      id: view.id,
      version: view.version,
      status: view.status,
      definitionKind: view.definitionKind,
      aggregation: view.aggregation,
      formula: view.formula,
      dimensions: view.dimensions,
      unit: view.unit,
    });
    familiesByName.set(view.name, family);
  }
  return [...familiesByName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A project's metric catalog (KAN-40; plan `04 §2`): every registered
 * metric, every version of each (plan `04 §7`: "changing a definition is
 * tracked, and historical dashboards can pin a version"), and a form to
 * register a new one or evolve an existing family to its next version.
 * Gated on `metrics.write` for the whole page — same "whole feature, not
 * just mutation, is admin-only" posture KAN-31's schema registry page
 * established. Checked at project scope, not just org scope (KAN-136), so
 * a project-scoped `project_admin`/`editor`/`operator` (KAN-135) can reach
 * their own project's metric catalog.
 *
 * Above the catalog: its shape (definition types, the warehouse tables it reads, the metrics formulas
 * build on) and an interactive lineage graph of one metric (`?metric=`), walking from the schema and
 * warehouse table through every input metric to the formulas that use it. Clicking a metric node
 * re-focuses the graph on it.
 */
export default async function MetricRegistryPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { metric: metricParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fmetric-defs`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'metrics.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, metricDefs, schemaDefs] = await Promise.all([
    listOrgProjects(orgId),
    listMetricDefinitionsForProject(orgId, projectId),
    listSchemaDefinitionsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const families = groupIntoFamilies(metricDefs.map(toMetricDefView));

  const t = await getTranslations('MetricRegistry');
  const numberFormat = new Intl.NumberFormat(locale);
  const base = `/orgs/${orgId}/projects/${projectId}/metric-defs`;
  const lineageHref = (name: string) => `${base}?metric=${encodeURIComponent(name)}#metric-lineage`;

  const metrics = toCatalogMetrics(families);
  const stats = catalogStats(metrics);
  const typeBreakdown = metricTypeSlices(stats);
  const formulaShare = formulaSharePercent(stats);
  const usedBy = new Map(stats.reuse.map((entry) => [entry.name, entry.count]));
  const schemaNames = new Set(schemaDefs.filter((schemaDef) => schemaDef.status === 'active').map((schemaDef) => schemaDef.name));
  const focusName = pickLineageFocus(metrics, metricParam);
  const lineage = focusName ? buildMetricLineage(metrics, focusName, schemaNames) : { nodes: [], edges: [] };

  const lineageNode = (node: LineageNode): FlowNodeSpec => {
    if (node.type === 'schema') {
      return { id: node.id, label: node.name, sublabel: t('lineageSchemaSub'), status: 'ok', href: `/orgs/${orgId}/projects/${projectId}/schema-defs` };
    }
    if (node.type === 'table') {
      return { id: node.id, label: node.name, sublabel: t('lineageTableSub'), status: 'idle' };
    }
    if (node.type === 'missing') {
      return { id: node.id, label: node.name, sublabel: t('lineageMissingSub'), status: 'error' };
    }
    const metric = node.metric!;
    return {
      id: node.id,
      // Name plus version: the version is what a query resolves against, and it keeps the node's
      // text distinct from the catalog card's own name heading.
      label: t('lineageMetricLabel', { name: metric.name, version: metric.version }),
      sublabel:
        metric.definitionKind === 'formula'
          ? t('lineageFormulaSub', { count: metric.inputs.length })
          : t('lineageAggregationSub', { function: metric.aggregationFunction ?? '', column: metric.column ?? '*' }),
      value: node.focus ? t('lineageFocusValue') : undefined,
      status: metric.archived ? 'idle' : node.focus ? 'ok' : 'idle',
      href: node.focus ? undefined : lineageHref(metric.name),
    };
  };

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={BookOpenCheck} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiActive')} value={numberFormat.format(stats.active)} subtext={stats.archived > 0 ? t('kpiArchivedSub', { count: stats.archived }) : undefined} icon={BookOpenCheck} />
          <StatCard
            title={t('kpiFormulaShare')}
            value={numberFormat.format(stats.formula)}
            progress={formulaShare ?? undefined}
            targetHint={formulaShare === null ? undefined : t('kpiFormulaShareHint')}
            icon={FunctionSquare}
          />
          <StatCard title={t('kpiSources')} value={numberFormat.format(stats.tables.length)} icon={Database} />
          <StatCard title={t('kpiEvolved')} value={numberFormat.format(stats.evolved)} icon={History} />
        </div>
      </PageHero>

      {families.length > 0 ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title={t('typesTitle')} description={t('typesDescription')} icon={Sigma} fill>
              <DonutChart
                label={t('typesTitle')}
                centerValue={numberFormat.format(typeBreakdown.total)}
                centerLabel={t('typesCenter')}
                data={typeBreakdown.slices.map((slice) =>
                  slice.kind === 'aggregation'
                    ? { label: t('kindAggregation'), value: slice.value, color: 'hsl(var(--primary))' }
                    : { label: t('kindFormula'), value: slice.value, color: 'hsl(var(--info))' },
                )}
                size={150}
                layout="stacked"
              />
            </ChartCard>
            <ChartCard title={t('sourcesTitle')} description={t('sourcesDescription')} icon={Database} fill>
              {stats.tables.length > 0 ? (
                <BarList
                  items={stats.tables.map((entry) => ({ key: entry.table, label: entry.table, value: entry.count }))}
                  maxItems={8}
                  moreLabel={(hidden) => t('moreRows', { count: hidden })}
                />
              ) : (
                <EmptyState compact icon={Database} title={t('sourcesEmpty')} />
              )}
            </ChartCard>
            <ChartCard title={t('reuseTitle')} description={t('reuseDescription')} icon={Recycle} fill>
              {stats.reuse.length > 0 ? (
                <BarList
                  items={stats.reuse.map((entry) => ({ key: entry.name, label: entry.name, value: entry.count, href: lineageHref(entry.name) }))}
                  maxItems={8}
                  moreLabel={(hidden) => t('moreRows', { count: hidden })}
                  color="hsl(var(--info))"
                />
              ) : (
                <EmptyState compact icon={Recycle} title={t('reuseEmpty')} description={t('reuseEmptyDetail')} />
              )}
            </ChartCard>
          </div>

          <div id="metric-lineage" className="scroll-mt-6">
            <ChartCard
              title={t('lineageTitle')}
              description={focusName ? t('lineageDescription', { name: focusName }) : undefined}
              icon={GitBranch}
              footer={t('lineageFooter')}
            >
              {lineage.nodes.length > 0 ? (
                <FlowDiagram
                  label={t('lineageTitle')}
                  nodes={lineage.nodes.map(lineageNode)}
                  edges={lineage.edges.map((edge) => ({ source: edge.source, target: edge.target, status: 'ok' as const, animated: false }))}
                  height={Math.min(560, Math.max(260, 110 * tallestLineageColumn(lineage)))}
                />
              ) : (
                <EmptyState compact icon={GitBranch} title={t('lineageEmpty')} />
              )}
            </ChartCard>
          </div>
        </>
      ) : null}

      <ChartCard title={t('registeredHeading')} description={t('registeredDescription')} icon={BookOpenCheck}>
        {families.length === 0 ? (
          <EmptyState compact icon={BookOpenCheck} title={t('noMetrics')} description={t('noMetricsDetail')} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {families.map((family) => (
              <MetricFamilyCard
                key={family.name}
                orgId={orgId}
                projectId={projectId}
                name={family.name}
                versions={family.versions}
                lineageHref={family.name === focusName ? undefined : lineageHref(family.name)}
                usedByCount={usedBy.get(family.name) ?? 0}
              />
            ))}
          </ul>
        )}
        {stats.archived > 0 ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            {t('archivedNote', { count: stats.archived })}
          </p>
        ) : null}
      </ChartCard>

      <ChartCard title={t('registerHeading')} description={t('registerDescription')} icon={FilePlus2}>
        <RegisterMetricDefForm orgId={orgId} projectId={projectId} />
      </ChartCard>
    </div>
  );
}


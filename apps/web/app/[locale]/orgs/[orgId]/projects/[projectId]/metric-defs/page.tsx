import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listMetricDefinitionsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { toMetricDefView, type MetricDefView } from '@/lib/orgs/metric-def-view';
import { RegisterMetricDefForm } from '@/components/orgs/register-metric-def-form';
import { MetricFamilyCard } from '@/components/orgs/metric-family-card';
import type { MetricVersionView } from '@/components/orgs/metric-definition-editor';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { Calculator, PlusCircle } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
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
    });
    familiesByName.set(view.name, family);
  }
  return [...familiesByName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A project's metric catalog (KAN-40): registered metrics, version tracking,
 * formula studio and aggregations.
 */
export default async function MetricRegistryPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fmetric-defs`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'metrics.write', { orgId })) {
    notFound();
  }

  const [projects, metricDefs] = await Promise.all([listOrgProjects(orgId), listMetricDefinitionsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/metric-defs`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const families = groupIntoFamilies(metricDefs.map(toMetricDefView));
  const t = await getTranslations('MetricRegistry');

  const activeMetricsCount = metricDefs.filter((d) => d.status === 'active').length;
  const baseAggregationsCount = metricDefs.filter((d) => d.definition_kind === 'aggregation').length;
  const derivedFormulasCount = metricDefs.filter((d) => d.definition_kind === 'formula').length;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        meta={`${families.length} families · ${metricDefs.length} versions`}
      />

      {/* KPI Grid */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiRegisteredKpis')}
          value={families.length}
          accent="primary"
          badge={`${families.length} KPIs`}
          badgeAccent="primary"
        />
        <PpKpiCard
          label={t('kpiActiveMetrics')}
          value={activeMetricsCount}
          accent="mint"
          badge="Active"
          badgeAccent="mint"
        />
        <PpKpiCard
          label={t('kpiBaseAggregations')}
          value={baseAggregationsCount}
          accent="sky"
          badge="Base"
          badgeAccent="sky"
        />
        <PpKpiCard
          label={t('kpiDerivedFormulas')}
          value={derivedFormulasCount}
          accent="pink"
          badge="Formulas"
          badgeAccent="pink"
        />
      </PpKpiGrid>

      {/* Registered Metrics Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-lg text-pp-on-surface">
            {t('registeredHeading')}
          </h2>
          <span className="text-pp-label-sm text-pp-outline font-bold uppercase tracking-wider">
            {families.length} {families.length === 1 ? 'Metric' : 'Metrics'}
          </span>
        </div>

        {families.length === 0 ? (
          <PpEmptyState
            icon={Calculator}
            title={t('noMetrics')}
            description={t('noMetricsDesc')}
          />
        ) : (
          <ul className="flex flex-col gap-4 list-none p-0 m-0">
            {families.map((family) => (
              <MetricFamilyCard key={family.name} orgId={orgId} projectId={projectId} name={family.name} versions={family.versions} />
            ))}
          </ul>
        )}
      </section>

      {/* Register New Metric Section */}
      <PpCard
        title={t('registerHeading')}
        subtitle="Define a new aggregation or formula KPI definition"
        icon={PlusCircle}
        iconAccent="primary"
      >
        <RegisterMetricDefForm orgId={orgId} projectId={projectId} />
      </PpCard>
    </PpPage>
  );
}

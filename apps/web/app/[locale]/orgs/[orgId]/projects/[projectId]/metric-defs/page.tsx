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
 * established.
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
    notFound();
  }

  const families = groupIntoFamilies(metricDefs.map(toMetricDefView));

  const t = await getTranslations('MetricRegistry');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registeredHeading')}</h2>
        {families.length === 0 ? (
          <p className="text-muted-foreground">{t('noMetrics')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {families.map((family) => (
              <MetricFamilyCard key={family.name} orgId={orgId} projectId={projectId} name={family.name} versions={family.versions} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registerHeading')}</h2>
        <RegisterMetricDefForm orgId={orgId} projectId={projectId} />
      </section>
    </main>
  );
}
